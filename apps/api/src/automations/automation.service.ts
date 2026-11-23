import {
    type AutomationAction,
    type AutomationRule,
    type AutomationRuleDto,
    type AutomationRuleInput,
    type AutomationTrigger,
    automationActionSchema,
    automationRuleSchema,
    automationTargets,
    type KobralinkEvent,
    type KobralinkEventType,
} from '@kobralink/shared';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    type OnModuleDestroy,
    type OnModuleInit,
} from '@nestjs/common';
import { BridgeRegistry } from '../bridge/bridge.registry';
import type { PrinterBridge } from '../bridge/printer-bridge';
import type { AutomationRule as Row } from '../generated/prisma/client';
import { PowerService } from '../home-assistant/power.service';
import { m } from '../i18n/locale';
import { MacroService } from '../macros/macro.service';
import { NotificationService } from '../notifications/notification.service';
import { PrintersService } from '../printers/printers.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

const EVENT_TRIGGER: Partial<Record<KobralinkEventType, AutomationTrigger>> = {
    print_finished: 'print_finished',
    print_cancelled: 'print_failed',
    alert_spool_low: 'filament_low',
};

const COOL_NOZZLE_C = 50;
const COOL_TIMEOUT_MS = 30 * 60_000;
const COOL_POLL_MS = 5000;
const CLOCK_MS = 20_000;

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(AutomationService.name);
    private readonly running = new Set<string>();
    private clock: NodeJS.Timeout | null = null;
    private lastMinute = '';
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    private readonly onNotification = (ev: KobralinkEvent) => {
        const trigger = EVENT_TRIGGER[ev.type];
        if (trigger && ev.printerId) void this.fire(trigger, ev.printerId);
    };
    private readonly onBedCleared = (printerId: string) => void this.fire('bed_cleared', printerId);

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: BridgeRegistry,
        private readonly macros: MacroService,
        private readonly notifications: NotificationService,
        private readonly queue: QueueService,
        private readonly powerService: PowerService,
    ) {}

    onModuleInit(): void {
        this.notifications.on('notification', this.onNotification);
        this.queue.on('bed_cleared', this.onBedCleared);
        this.clock = setInterval(() => void this.tick(), CLOCK_MS);
    }

    onModuleDestroy(): void {
        this.notifications.off('notification', this.onNotification);
        this.queue.off('bed_cleared', this.onBedCleared);
        if (this.clock) clearInterval(this.clock);
        this.clock = null;
    }

    async list(): Promise<AutomationRuleDto[]> {
        const rows = await this.prisma.client.automationRule.findMany({ orderBy: { createdAt: 'asc' } });
        return rows.map(toDto);
    }

    async get(id: string): Promise<AutomationRuleDto> {
        const row = await this.prisma.client.automationRule.findUnique({ where: { id } });
        if (!row) throw new NotFoundException(m.api_automation_not_found());
        return toDto(row);
    }

    async create(input: AutomationRuleInput): Promise<AutomationRuleDto> {
        const rule = await this.validate(input);
        const row = await this.prisma.client.automationRule.create({ data: toData(rule) });
        return toDto(row);
    }

    async update(id: string, input: AutomationRuleInput): Promise<AutomationRuleDto> {
        await this.get(id);
        const rule = await this.validate(input);
        const row = await this.prisma.client.automationRule.update({ where: { id }, data: toData(rule) });
        return toDto(row);
    }

    async setEnabled(id: string, enabled: boolean): Promise<AutomationRuleDto> {
        await this.get(id);
        const row = await this.prisma.client.automationRule.update({ where: { id }, data: { enabled } });
        return toDto(row);
    }

    async remove(id: string): Promise<void> {
        await this.get(id);
        await this.prisma.client.automationRule.delete({ where: { id } });
    }

    async runNow(id: string, printerId: string): Promise<AutomationRuleDto> {
        const row = await this.prisma.client.automationRule.findUnique({ where: { id } });
        if (!row) throw new NotFoundException(m.api_automation_not_found());
        this.registry.get(printerId);
        await this.run(row, printerId);
        return this.get(id);
    }

    async fire(trigger: AutomationTrigger, printerId: string): Promise<void> {
        const rules = await this.prisma.client.automationRule.findMany({ where: { enabled: true, trigger } });
        if (!rules.length) return;
        const printer = (await this.printers()).find((p) => p.id === printerId);
        if (!printer) return;
        await Promise.all(rules.filter((r) => automationTargets(toDto(r), printer)).map((r) => this.run(r, printerId)));
    }

    async tick(now = new Date()): Promise<void> {
        const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const minute = `${now.toDateString()} ${time}`;
        if (minute === this.lastMinute) return;
        this.lastMinute = minute;
        const rules = await this.prisma.client.automationRule.findMany({
            where: { enabled: true, trigger: 'time', time },
        });
        if (!rules.length) return;
        const printers = await this.printers();
        await Promise.all(
            rules.flatMap((r) => printers.filter((p) => automationTargets(toDto(r), p)).map((p) => this.run(r, p.id))),
        );
    }

    private async printers(): Promise<{ id: string; name: string; tags: string[] }[]> {
        const rows = await this.prisma.client.printer.findMany({ select: { id: true, name: true, settings: true } });
        return rows.map((p) => ({
            id: p.id,
            name: p.name,
            tags: PrintersService.parseSettings(p.settings).profile.tags,
        }));
    }

    private async validate(input: AutomationRuleInput): Promise<AutomationRule> {
        const rule = automationRuleSchema.parse(input);
        if (rule.printerId) {
            const printer = await this.prisma.client.printer.findUnique({ where: { id: rule.printerId } });
            if (!printer) throw new BadRequestException(m.api_bridge_not_found());
        }
        for (const action of rule.actions) {
            if (action.type !== 'macro') continue;
            const macro = await this.prisma.client.macro.findUnique({ where: { id: action.macroId } });
            if (!macro) throw new BadRequestException(m.api_automation_macro_missing());
        }
        return rule;
    }

    private async run(row: Row, printerId: string): Promise<void> {
        const key = `${row.id}:${printerId}`;
        if (this.running.has(key)) return;
        this.running.add(key);
        const rule = toDto(row);
        let error = '';
        try {
            const bridge = this.registry.get(printerId);
            this.log.log(`Automation "${rule.name}" on ${bridge.config.name}`);
            for (const action of rule.actions) await this.exec(rule, bridge, action);
        } catch (e) {
            error = (e as Error).message || String(e);
            this.log.warn(`Automation "${rule.name}" failed: ${error}`);
        } finally {
            this.running.delete(key);
            await this.prisma.client.automationRule
                .update({ where: { id: row.id }, data: { lastRunAt: new Date(), lastError: error.slice(0, 500) } })
                .catch(() => null);
        }
    }

    private async exec(rule: AutomationRuleDto, bridge: PrinterBridge, action: AutomationAction): Promise<void> {
        switch (action.type) {
            case 'macro':
                await this.macros.run(bridge, await this.macros.get(action.macroId));
                return;
            case 'light':
                bridge.setLight(action.on);
                return;
            case 'feed':
                if (bridge.snapshot().externalSpoolOnly) throw new Error(m.api_automation_no_ace());
                bridge.amsFeed(action.slotIndex, action.direction === 'in' ? 1 : 2);
                return;
            case 'power':
                await this.power(bridge, action.action);
                return;
            case 'notify':
                this.notifications.emitCustom(bridge.id, bridge.config.name, 'automation', {
                    rule: rule.name,
                    message: action.message,
                });
                return;
            case 'wait':
                await this.sleep(action.seconds * 1000);
                return;
        }
    }

    private async power(bridge: PrinterBridge, action: 'on' | 'off'): Promise<void> {
        if (!this.powerService.configured(bridge.settings)) throw new Error(m.api_no_plug());
        if (action === 'off') {
            if (this.busy(bridge)) throw new Error(m.api_automation_power_busy());
            const deadline = Date.now() + COOL_TIMEOUT_MS;
            while (bridge.snapshot().connected && bridge.snapshot().nozzleTemp > COOL_NOZZLE_C) {
                if (Date.now() > deadline) throw new Error(m.api_automation_power_hot());
                await this.sleep(COOL_POLL_MS);
            }
            if (this.busy(bridge)) throw new Error(m.api_automation_power_busy());
        }
        await this.powerService.set(bridge.settings, action);
    }

    private busy(bridge: PrinterBridge): boolean {
        const s = bridge.snapshot();
        return s.connected && (s.printState === 'printing' || s.printState === 'paused');
    }
}

function toData(rule: AutomationRule) {
    return {
        name: rule.name,
        enabled: rule.enabled,
        trigger: rule.trigger,
        time: rule.trigger === 'time' ? rule.time : '',
        printerId: rule.printerId,
        targetTags: JSON.stringify(rule.printerId ? [] : rule.targetTags),
        actions: JSON.stringify(rule.actions),
    };
}

export function toDto(row: Row): AutomationRuleDto {
    return {
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        trigger: row.trigger as AutomationTrigger,
        time: row.time,
        printerId: row.printerId,
        targetTags: parseArray(row.targetTags).filter((t): t is string => typeof t === 'string'),
        actions: parseArray(row.actions).flatMap((a) => {
            const parsed = automationActionSchema.safeParse(a);
            return parsed.success ? [parsed.data] : [];
        }),
        lastRunAt: row.lastRunAt?.toISOString() ?? null,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
    };
}

function parseArray(raw: string): unknown[] {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}
