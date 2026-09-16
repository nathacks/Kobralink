import {
    filamentWeightG,
    type LocalSpoolDto,
    type LocalSpoolInput,
    localSpoolSchema,
    type UpdateLocalSpoolInput,
} from '@kobralink/shared';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { FilamentUsageSink } from '../bridge/printer-bridge';
import type { LocalSpool } from '../generated/prisma/client';
import { NotificationService } from '../notifications/notification.service';
import { PrintersService } from '../printers/printers.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocalSpoolService implements OnModuleInit, FilamentUsageSink {
    readonly name = 'local';
    readonly syncRateSec = 60;
    private readonly log = new Logger(LocalSpoolService.name);
    private readonly maps = new Map<string, Map<number, string>>();
    private readonly lowAlerted = new Set<string>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly printers: PrintersService,
        private readonly notifications: NotificationService,
    ) {}

    async onModuleInit(): Promise<void> {
        const rows = await this.prisma.client.localSpoolAssignment.findMany();
        for (const r of rows) this.printerMap(r.printerId).set(r.slotIndex, r.spoolId);
    }

    private printerMap(printerId: string): Map<number, string> {
        let m = this.maps.get(printerId);
        if (!m) {
            m = new Map();
            this.maps.set(printerId, m);
        }
        return m;
    }

    slotMap(printerId: string): ReadonlyMap<number, string> {
        return this.printerMap(printerId);
    }

    async list(includeArchived = false): Promise<LocalSpoolDto[]> {
        const rows = await this.prisma.client.localSpool.findMany({
            where: includeArchived ? undefined : { archived: false },
            orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }],
        });
        return rows.map(toDto);
    }

    async get(id: string): Promise<LocalSpoolDto> {
        const row = await this.prisma.client.localSpool.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        return toDto(row);
    }

    async create(input: LocalSpoolInput): Promise<LocalSpoolDto> {
        const data = localSpoolSchema.parse(input);
        const row = await this.prisma.client.localSpool.create({ data });
        return toDto(row);
    }

    async update(id: string, input: UpdateLocalSpoolInput): Promise<LocalSpoolDto> {
        const data = localSpoolSchema.partial().parse(input);
        const row = await this.prisma.client.localSpool.update({ where: { id }, data }).catch(() => null);
        if (!row) throw new NotFoundException();
        this.lowAlerted.delete(id);
        return toDto(row);
    }

    async remove(id: string): Promise<void> {
        await this.prisma.client.localSpool.delete({ where: { id } }).catch(() => null);
        for (const m of this.maps.values()) {
            for (const [slot, spoolId] of m) if (spoolId === id) m.delete(slot);
        }
    }

    async useFilament(spoolId: string | number, mm: number): Promise<void> {
        const id = String(spoolId);
        const row = await this.prisma.client.localSpool.update({
            where: { id },
            data: { usedMm: { increment: mm }, lastUsedAt: new Date() },
        });
        await this.checkLow(row);
    }

    private async checkLow(row: LocalSpool): Promise<void> {
        const dto = toDto(row);
        let printerId = '';
        for (const [pid, m] of this.maps) {
            if ([...m.values()].includes(row.id)) {
                printerId = pid;
                break;
            }
        }
        if (!printerId) return;
        const printer = await this.printers.findOne(printerId).catch(() => null);
        if (!printer) return;
        const threshold = PrintersService.parseSettings(printer.settings).alerts.spoolLowG;
        if (threshold <= 0) return;
        if (dto.remainingG > threshold) {
            this.lowAlerted.delete(row.id);
            return;
        }
        if (this.lowAlerted.has(row.id)) return;
        this.lowAlerted.add(row.id);
        this.notifications.emitCustom(printerId, printer.name, 'alert_spool_low', {
            spool: dto.name,
            grams: Math.round(dto.remainingG),
        });
    }

    assignments(printerId: string): Record<string, string> {
        return Object.fromEntries([...this.printerMap(printerId)].map(([k, v]) => [String(k), v]));
    }

    async setAssignments(printerId: string, slotMap: Record<string, string | null>): Promise<Record<string, string>> {
        const current = this.printerMap(printerId);
        for (const [k, v] of Object.entries(slotMap)) {
            const slot = Number(k);
            if (!Number.isInteger(slot) || slot < 0) continue;
            if (v) current.set(slot, v);
            else current.delete(slot);
        }
        await this.prisma.client.$transaction([
            this.prisma.client.localSpoolAssignment.deleteMany({ where: { printerId } }),
            ...[...current].map(([slotIndex, spoolId]) =>
                this.prisma.client.localSpoolAssignment.create({ data: { printerId, slotIndex, spoolId } }),
            ),
        ]);
        this.log.log(`Local spools for ${printerId}: ${JSON.stringify(this.assignments(printerId))}`);
        return this.assignments(printerId);
    }

    forgetPrinter(printerId: string): void {
        this.maps.delete(printerId);
    }
}

export function toDto(r: LocalSpool): LocalSpoolDto {
    const usedG = filamentWeightG(r.usedMm, r.diameterMm, r.densityGcm3);
    const remainingG = Math.max(0, r.initialWeightG - usedG);
    return {
        id: r.id,
        name: r.name,
        vendor: r.vendor,
        material: r.material,
        colorHex: r.colorHex,
        diameterMm: r.diameterMm,
        densityGcm3: r.densityGcm3,
        initialWeightG: r.initialWeightG,
        price: r.price,
        usedMm: r.usedMm,
        usedG: Math.round(usedG * 10) / 10,
        remainingG: Math.round(remainingG * 10) / 10,
        remainingValue: r.initialWeightG > 0 ? Math.round((remainingG / r.initialWeightG) * r.price * 100) / 100 : 0,
        archived: r.archived,
        createdAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    };
}
