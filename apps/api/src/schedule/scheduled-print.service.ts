import type { ScheduledPrintDto, SchedulePrintInput } from '@kobralink/shared';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { BridgeRegistry } from '../bridge/bridge.registry';
import type { PrinterBridge, StartPrintOptions } from '../bridge/printer-bridge';
import { localIpFor } from '../common/net';
import type { GcodeFile, ScheduledPrint } from '../generated/prisma/client';
import { m } from '../i18n/locale';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

const MAX_TIMER_MS = 2 ** 31 - 1;
const GRACE_MS = 60 * 60_000;

type Options = Omit<StartPrintOptions, 'serveBase'>;
type Row = ScheduledPrint & { file: GcodeFile };

@Injectable()
export class ScheduledPrintService implements OnModuleInit {
    private readonly log = new Logger(ScheduledPrintService.name);
    private readonly timers = new Map<string, NodeJS.Timeout>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: BridgeRegistry,
        private readonly queue: QueueService,
        private readonly notifications: NotificationService,
    ) {}

    async onModuleInit(): Promise<void> {
        const rows = await this.prisma.client.scheduledPrint.findMany();
        for (const r of rows) this.arm(r);
    }

    private arm(r: ScheduledPrint): void {
        const delay = r.startAt.getTime() - Date.now();
        if (delay < -GRACE_MS) {
            void this.prisma.client.scheduledPrint.delete({ where: { id: r.id } }).catch(() => null);
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
            setTimeout(() => void this.fire(r.id), wait),
        );
    }

    async fire(id: string): Promise<void> {
        this.timers.delete(id);
        const row = await this.prisma.client.scheduledPrint.findUnique({
            where: { id },
            include: { file: true, printer: true },
        });
        if (!row) return;
        await this.prisma.client.scheduledPrint.delete({ where: { id } }).catch(() => null);
        let bridge: PrinterBridge;
        try {
            bridge = this.registry.get(row.printerId);
        } catch {
            return;
        }
        const options = parseOptions(row.options);
        const s = bridge.snapshot();
        const idle = s.connected && s.printState !== 'printing' && s.printState !== 'paused';
        if (!idle || row.printer.awaitingBedClear || row.printer.maintenance) {
            const { excludedObjects, ...queued } = options;
            await this.queue
                .add(
                    row.fileId,
                    excludedObjects ?? [],
                    true,
                    queued,
                    { printerId: row.printerId, targetTags: [] },
                    false,
                )
                .catch(() => null);
            this.log.warn(
                `Scheduled print ${row.file.filename} queued: printer busy, offline, in maintenance or waiting for its bed`,
            );
            this.notify(bridge, row.file.filename, 'queued');
            return;
        }
        try {
            await bridge.printStoredFile(row.fileId, {
                ...options,
                serveBase: `http://${localIpFor(bridge.config.ip)}:${bridge.config.httpPort}`,
            });
            this.log.log(`Scheduled print started: ${row.file.filename}`);
            this.notify(bridge, row.file.filename, 'started');
        } catch (e) {
            this.log.warn(`Scheduled print failed: ${(e as Error).message}`);
            this.notify(bridge, row.file.filename, 'failed', (e as Error).message);
        }
    }

    private notify(bridge: PrinterBridge, filename: string, result: 'started' | 'queued' | 'failed', error = ''): void {
        this.notifications.emitCustom(bridge.id, bridge.config.name, 'scheduled_print', { filename, result, error });
    }

    async list(printerId: string): Promise<ScheduledPrintDto[]> {
        const rows = await this.prisma.client.scheduledPrint.findMany({
            where: { printerId },
            orderBy: { startAt: 'asc' },
            include: { file: true },
        });
        return rows.map(toDto);
    }

    async create(printerId: string, input: SchedulePrintInput): Promise<ScheduledPrintDto> {
        this.registry.get(printerId);
        const startAt = new Date(input.startAt);
        if (startAt.getTime() < Date.now() - 60_000) throw new BadRequestException(m.api_schedule_past());
        const file = await this.prisma.client.gcodeFile.findUnique({ where: { id: input.fileId } });
        if (!file) throw new NotFoundException(m.api_file_not_found());
        const { startAt: _startAt, fileId: _fileId, ...options } = input;
        const row = await this.prisma.client.scheduledPrint.create({
            data: { printerId, fileId: file.id, startAt, options: JSON.stringify(options) },
            include: { file: true },
        });
        this.arm(row);
        return toDto(row);
    }

    async remove(printerId: string, id: string): Promise<void> {
        const row = await this.prisma.client.scheduledPrint.findFirst({ where: { id, printerId } });
        if (!row) throw new NotFoundException();
        const t = this.timers.get(id);
        if (t) clearTimeout(t);
        this.timers.delete(id);
        await this.prisma.client.scheduledPrint.delete({ where: { id } });
    }
}

export function parseOptions(raw: string): Options {
    try {
        const v = JSON.parse(raw) as Options;
        return v && typeof v === 'object' ? v : {};
    } catch {
        return {};
    }
}

function toDto(r: Row): ScheduledPrintDto {
    return {
        id: r.id,
        printerId: r.printerId,
        fileId: r.fileId,
        filename: r.file.filename,
        thumbnail: r.file.thumbnail,
        estPrintTimeSec: r.file.estPrintTimeSec,
        startAt: r.startAt.toISOString(),
        excludedObjects: parseOptions(r.options).excludedObjects ?? [],
        createdAt: r.createdAt.toISOString(),
    };
}
