import { type PrinterLiveState, type QueueItemDto, TERMINAL_PRINT_STATES } from '@kobralink/shared';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { localIpFor } from '../common/net';
import { GcodeService } from '../gcode/gcode.service';
import type { GcodeFile, QueueItem } from '../generated/prisma/client';
import { m } from '../i18n/locale';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';

const AUTO_START_DELAY_MS = 15_000;

interface Watch {
    lastKobraState: string;
    armed: boolean;
    timer: NodeJS.Timeout | null;
    notified: boolean;
}

@Injectable()
export class QueueService {
    private readonly log = new Logger(QueueService.name);
    private readonly watches = new Map<string, Watch>();
    private readonly bridges = new Map<string, PrinterBridge>();
    private readonly detached = new Map<string, () => void>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gcode: GcodeService,
        private readonly notifications: NotificationService,
    ) {}

    attach(bridge: PrinterBridge): void {
        this.bridges.set(bridge.id, bridge);
        const watch: Watch = { lastKobraState: '', armed: false, timer: null, notified: false };
        this.watches.set(bridge.id, watch);
        const onState = (state: PrinterLiveState) => void this.onState(bridge, watch, state);
        bridge.on('state', onState);
        this.detached.set(bridge.id, () => bridge.off('state', onState));
    }

    detach(printerId: string): void {
        this.detached.get(printerId)?.();
        this.detached.delete(printerId);
        const w = this.watches.get(printerId);
        if (w?.timer) clearTimeout(w.timer);
        this.watches.delete(printerId);
        this.bridges.delete(printerId);
    }

    private async onState(bridge: PrinterBridge, w: Watch, s: PrinterLiveState): Promise<void> {
        const prev = w.lastKobraState;
        w.lastKobraState = s.kobraState;
        if (prev === s.kobraState) return;
        if (s.kobraState === 'finished') {
            w.armed = true;
            w.notified = false;
            return;
        }
        if (s.kobraState === 'printing' || s.kobraState === 'preheating') {
            w.armed = false;
            w.notified = false;
            if (w.timer) {
                clearTimeout(w.timer);
                w.timer = null;
            }
            return;
        }
        if (!w.armed || s.kobraState !== 'free' || !s.connected) return;
        w.armed = false;
        const next = await this.peek(bridge.id);
        if (!next) return;
        if (bridge.settings.queueAutoStart) {
            this.log.log(`Queue: auto-start of ${next.filename} in ${AUTO_START_DELAY_MS / 1000} s`);
            w.timer = setTimeout(() => {
                w.timer = null;
                void this.startNext(bridge.id).catch((e) =>
                    this.log.warn(`Queue: auto-start failed: ${(e as Error).message}`),
                );
            }, AUTO_START_DELAY_MS);
        } else if (!w.notified) {
            w.notified = true;
            this.notifications.emitCustom(bridge.id, bridge.config.name, 'queue_next', { filename: next.filename });
        }
    }

    private serveBase(bridge: PrinterBridge): string {
        return `http://${localIpFor(bridge.config.ip)}:${bridge.config.httpPort}`;
    }

    async list(printerId: string): Promise<QueueItemDto[]> {
        const rows = await this.prisma.client.queueItem.findMany({
            where: { printerId },
            orderBy: { position: 'asc' },
            include: { file: true },
        });
        return rows.map(toDto);
    }

    async peek(printerId: string): Promise<QueueItemDto | null> {
        const row = await this.prisma.client.queueItem.findFirst({
            where: { printerId },
            orderBy: { position: 'asc' },
            include: { file: true },
        });
        return row ? toDto(row) : null;
    }

    async add(printerId: string, fileId: string, excludedObjects: string[]): Promise<QueueItemDto> {
        const file = await this.prisma.client.gcodeFile.findUnique({ where: { id: fileId } });
        if (!file) throw new NotFoundException(m.api_file_not_found());
        const last = await this.prisma.client.queueItem.findFirst({
            where: { printerId },
            orderBy: { position: 'desc' },
        });
        const row = await this.prisma.client.queueItem.create({
            data: {
                printerId,
                fileId,
                position: (last?.position ?? 0) + 1,
                excludedObjects: JSON.stringify(excludedObjects),
            },
            include: { file: true },
        });
        return toDto(row);
    }

    async addByFilename(printerId: string, filename: string): Promise<QueueItemDto> {
        const file = await this.gcode.getByFilename(filename);
        if (!file) throw new NotFoundException(m.api_unknown_store_file({ name: filename }));
        return this.add(printerId, file.id, []);
    }

    async remove(printerId: string, id: string): Promise<void> {
        await this.prisma.client.queueItem.deleteMany({ where: { id, printerId } });
    }

    async clear(printerId: string): Promise<void> {
        await this.prisma.client.queueItem.deleteMany({ where: { printerId } });
    }

    async reorder(printerId: string, ids: string[]): Promise<QueueItemDto[]> {
        await this.prisma.client.$transaction(
            ids.map((id, i) =>
                this.prisma.client.queueItem.updateMany({ where: { id, printerId }, data: { position: i + 1 } }),
            ),
        );
        return this.list(printerId);
    }

    async startNext(printerId: string): Promise<QueueItemDto> {
        const bridge = this.bridges.get(printerId);
        if (!bridge) throw new NotFoundException(m.api_bridge_not_found());
        const next = await this.peek(printerId);
        if (!next) throw new NotFoundException(m.api_queue_empty());
        const s = bridge.snapshot();
        if (s.printState === 'printing' || s.printState === 'paused') throw new Error(m.api_queue_busy());
        await bridge.printStoredFile(next.fileId, {
            serveBase: this.serveBase(bridge),
            excludedObjects: next.excludedObjects,
        });
        await this.prisma.client.queueItem.delete({ where: { id: next.id } }).catch(() => null);
        this.log.log(`Queue: started ${next.filename}`);
        return next;
    }

    isIdle(printerId: string): boolean {
        const b = this.bridges.get(printerId);
        if (!b) return false;
        const s = b.snapshot();
        return s.connected && (s.kobraState === 'free' || TERMINAL_PRINT_STATES.has(s.kobraState));
    }
}

function toDto(r: QueueItem & { file: GcodeFile }): QueueItemDto {
    let excluded: string[] = [];
    try {
        const v = JSON.parse(r.excludedObjects);
        if (Array.isArray(v)) excluded = v.filter((x): x is string => typeof x === 'string');
    } catch {
        excluded = [];
    }
    return {
        id: r.id,
        printerId: r.printerId,
        fileId: r.fileId,
        filename: r.file.filename,
        thumbnail: r.file.thumbnail,
        estPrintTimeSec: r.file.estPrintTimeSec,
        position: r.position,
        excludedObjects: excluded,
        createdAt: r.createdAt.toISOString(),
    };
}
