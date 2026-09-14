import type { ScheduleDryInput, ScheduledDryDto } from '@kobralink/shared';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { BridgeRegistry } from '../bridge/bridge.registry';
import type { ScheduledDry } from '../generated/prisma/client';
import { m } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';

const MAX_TIMER_MS = 2 ** 31 - 1;
const GRACE_MS = 60 * 60_000;

@Injectable()
export class DryScheduleService implements OnModuleInit {
    private readonly log = new Logger(DryScheduleService.name);
    private readonly timers = new Map<string, NodeJS.Timeout>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: BridgeRegistry,
    ) {}

    async onModuleInit(): Promise<void> {
        const rows = await this.prisma.client.scheduledDry.findMany();
        for (const r of rows) this.arm(r);
    }

    private arm(r: ScheduledDry): void {
        const delay = r.startAt.getTime() - Date.now();
        if (delay < -GRACE_MS) {
            void this.prisma.client.scheduledDry.delete({ where: { id: r.id } }).catch(() => null);
            return;
        }
        const existing = this.timers.get(r.id);
        if (existing) clearTimeout(existing);
        const wait = Math.max(0, delay);
        if (wait > MAX_TIMER_MS) {
            this.timers.set(
                r.id,
                setTimeout(() => this.arm(r), MAX_TIMER_MS),
            );
            return;
        }
        this.timers.set(
            r.id,
            setTimeout(() => void this.fire(r), wait),
        );
    }

    private async fire(r: ScheduledDry): Promise<void> {
        this.timers.delete(r.id);
        await this.prisma.client.scheduledDry.delete({ where: { id: r.id } }).catch(() => null);
        try {
            const bridge = this.registry.get(r.printerId);
            bridge.aceDry('start', { aceId: r.aceId ?? undefined, targetTemp: r.targetTemp, duration: r.duration });
            this.log.log(`Scheduled drying started on ${bridge.config.name} (${r.targetTemp} °C, ${r.duration} min)`);
        } catch (e) {
            this.log.warn(`Scheduled drying failed: ${(e as Error).message}`);
        }
    }

    async list(printerId: string): Promise<ScheduledDryDto[]> {
        const rows = await this.prisma.client.scheduledDry.findMany({
            where: { printerId },
            orderBy: { startAt: 'asc' },
        });
        return rows.map(toDto);
    }

    async create(printerId: string, input: ScheduleDryInput): Promise<ScheduledDryDto> {
        this.registry.get(printerId);
        const startAt = new Date(input.startAt);
        if (startAt.getTime() < Date.now() - 60_000) throw new BadRequestException(m.api_schedule_past());
        const row = await this.prisma.client.scheduledDry.create({
            data: {
                printerId,
                aceId: input.aceId ?? null,
                startAt,
                targetTemp: input.targetTemp,
                duration: input.duration,
            },
        });
        this.arm(row);
        return toDto(row);
    }

    async remove(printerId: string, id: string): Promise<void> {
        const row = await this.prisma.client.scheduledDry.findFirst({ where: { id, printerId } });
        if (!row) throw new NotFoundException();
        const t = this.timers.get(id);
        if (t) clearTimeout(t);
        this.timers.delete(id);
        await this.prisma.client.scheduledDry.delete({ where: { id } });
    }
}

function toDto(r: ScheduledDry): ScheduledDryDto {
    return {
        id: r.id,
        printerId: r.printerId,
        aceId: r.aceId,
        startAt: r.startAt.toISOString(),
        targetTemp: r.targetTemp,
        duration: r.duration,
        createdAt: r.createdAt.toISOString(),
    };
}
