import { type MacroAction, type MacroDto, type MacroIcon, type MacroInput, macroSchema } from '@kobralink/shared';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import type { Macro } from '../generated/prisma/client';
import { m } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';

const AXIS_ID: Record<'x' | 'y' | 'z', number> = { x: 1, y: 2, z: 3 };

@Injectable()
export class MacroService {
    private readonly log = new Logger(MacroService.name);
    private readonly running = new Set<string>();

    constructor(private readonly prisma: PrismaService) {}

    async list(): Promise<MacroDto[]> {
        const rows = await this.prisma.client.macro.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
        return rows.map(toDto);
    }

    async get(id: string): Promise<MacroDto> {
        const row = await this.prisma.client.macro.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        return toDto(row);
    }

    async findByName(name: string): Promise<MacroDto | null> {
        const rows = await this.prisma.client.macro.findMany();
        const wanted = normalize(name);
        const row = rows.find((r) => normalize(r.name) === wanted);
        return row ? toDto(row) : null;
    }

    async create(input: MacroInput): Promise<MacroDto> {
        const data = macroSchema.parse(input);
        const dup = await this.findByName(data.name);
        if (dup) throw new ConflictException(m.api_macro_exists());
        const last = await this.prisma.client.macro.findFirst({ orderBy: { position: 'desc' } });
        const row = await this.prisma.client.macro.create({
            data: {
                name: data.name,
                icon: data.icon,
                actions: JSON.stringify(data.actions),
                position: (last?.position ?? 0) + 1,
            },
        });
        return toDto(row);
    }

    async update(id: string, input: MacroInput): Promise<MacroDto> {
        const data = macroSchema.parse(input);
        const dup = await this.findByName(data.name);
        if (dup && dup.id !== id) throw new ConflictException(m.api_macro_exists());
        const row = await this.prisma.client.macro
            .update({
                where: { id },
                data: { name: data.name, icon: data.icon, actions: JSON.stringify(data.actions) },
            })
            .catch(() => null);
        if (!row) throw new NotFoundException();
        return toDto(row);
    }

    async remove(id: string): Promise<void> {
        await this.prisma.client.macro.delete({ where: { id } }).catch(() => null);
    }

    async reorder(ids: string[]): Promise<MacroDto[]> {
        await this.prisma.client.$transaction(
            ids.map((id, i) => this.prisma.client.macro.updateMany({ where: { id }, data: { position: i + 1 } })),
        );
        return this.list();
    }

    isRunning(printerId: string): boolean {
        return this.running.has(printerId);
    }

    async run(bridge: PrinterBridge, macro: MacroDto): Promise<void> {
        if (this.running.has(bridge.id)) throw new ConflictException(m.api_macro_busy());
        this.running.add(bridge.id);
        this.log.log(`Macro "${macro.name}" on ${bridge.config.name}`);
        try {
            for (const action of macro.actions) await this.exec(bridge, action);
        } finally {
            this.running.delete(bridge.id);
        }
    }

    private async exec(bridge: PrinterBridge, a: MacroAction): Promise<void> {
        switch (a.type) {
            case 'temperature':
                bridge.setTemperature(a.nozzle, a.bed);
                return;
            case 'fan':
                bridge.setFan(a.speed);
                return;
            case 'light':
                bridge.setLight(a.on, a.brightness);
                return;
            case 'speed':
                bridge.setSpeedMode(a.mode);
                return;
            case 'home':
                await bridge.moveAxis(a.axis === 'all' ? 4 : a.axis === 'xy' ? 2 : 3, 2, 0);
                return;
            case 'move':
                await bridge.moveAxis(AXIS_ID[a.axis], a.distance >= 0 ? 1 : 0, Math.abs(a.distance));
                return;
            case 'motorsOff':
                bridge.disableSteppers();
                return;
            case 'feed':
                bridge.amsFeed(a.slotIndex, a.direction === 'in' ? 1 : 2);
                return;
            case 'dry':
                bridge.aceDry('start', { targetTemp: a.targetTemp, duration: a.duration });
                return;
            case 'dryStop':
                bridge.aceDry('stop', { targetTemp: 0, duration: 0 });
                return;
            case 'wait':
                await sleep(a.seconds * 1000);
                return;
            case 'waitTemp': {
                const deadline = Date.now() + 15 * 60_000;
                while (Date.now() < deadline) {
                    const s = bridge.snapshot();
                    const nozzleOk = a.nozzle === undefined || Math.abs(s.nozzleTemp - a.nozzle) <= 3;
                    const bedOk = a.bed === undefined || Math.abs(s.bedTemp - a.bed) <= 2;
                    if (nozzleOk && bedOk) return;
                    if (!s.connected) return;
                    await sleep(2000);
                }
                return;
            }
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function normalize(name: string): string {
    return name
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
}

export function toDto(r: Macro): MacroDto {
    let actions: MacroAction[] = [];
    try {
        const v = JSON.parse(r.actions);
        if (Array.isArray(v)) actions = v;
    } catch {
        actions = [];
    }
    return {
        id: r.id,
        name: r.name,
        icon: r.icon as MacroIcon,
        actions,
        position: r.position,
        createdAt: r.createdAt.toISOString(),
    };
}
