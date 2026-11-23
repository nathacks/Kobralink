import { EventEmitter } from 'node:events';
import {
    ACTIVE_PRINT_STATES,
    type BedClearResultDto,
    blockingReasons,
    COLOR_TOLERANCE,
    type CompatReason,
    type GcodeFilament,
    hexDistance,
    isTargeted,
    materialFamily,
    type PrinterLiveState,
    type PrinterTargetInfo,
    printerSpecs,
    type QueueCheckDto,
    type QueueItemDto,
    type QueuePrintOptions,
    type QueueStatusDto,
    type QueueTarget,
    type QueueWaitReason,
    queuePrintOptionsSchema,
    type StockFilament,
    slotUsableForPrint,
    staticReasons,
    stockReasons,
    TERMINAL_PRINT_STATES,
} from '@kobralink/shared';
import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { localIpFor } from '../common/net';
import { GcodeService } from '../gcode/gcode.service';
import type { GcodeFile, Printer, QueueItem } from '../generated/prisma/client';
import { m } from '../i18n/locale';
import { NotificationService } from '../notifications/notification.service';
import { PrintersService } from '../printers/printers.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpoolmanService } from '../spoolman/spoolman.service';
import { LocalSpoolService } from '../spools/local-spool.service';

const START_COOLDOWN_MS = 30_000;
export const EXTERNAL_SLOT_KEY = '0';

interface Watch {
    lastKobraState: string;
    active: boolean;
    armed: boolean;
    timer: NodeJS.Timeout | null;
    startAt: number | null;
    notified: boolean;
}

type Row = QueueItem & { file: GcodeFile };

export interface SlotFilament {
    material: string;
    colorHex: string;
    remainingG: number | null;
}

type Fit = 'ok' | 'short' | 'mismatch';

export function parseTags(raw: string): string[] {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function parseFilaments(raw: string): GcodeFilament[] {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

function rgbHex([r, g, b]: [number, number, number]): string {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function sameMaterial(slot: SlotFilament, need: GcodeFilament): boolean {
    const family = materialFamily(need.material);
    return !(slot.material && family && materialFamily(slot.material) !== family);
}

function closeColor(slot: SlotFilament, need: GcodeFilament): boolean {
    return !(slot.colorHex && need.colorHex && hexDistance(slot.colorHex, need.colorHex) > COLOR_TOLERANCE);
}

export function filamentFit(
    used: GcodeFilament[],
    assignments: QueuePrintOptions['filamentAssignments'],
    slots: Map<string, SlotFilament>,
    ledger: Map<string, number>,
): { fit: Fit; spend: Map<string, number> } {
    const spend = new Map<string, number>();
    let fit: Fit = 'ok';
    for (const need of used) {
        const assigned = assignments?.find((a) => a.paintIndex === need.slotIndex)?.slotIndex;
        let key = assigned !== undefined && assigned >= 0 ? String(assigned) : undefined;
        if (key === undefined) {
            const entries = [...slots];
            key =
                slots.size === 1
                    ? entries[0][0]
                    : (entries.find(([, s]) => sameMaterial(s, need) && closeColor(s, need)) ??
                          entries.find(([, s]) => sameMaterial(s, need)))?.[0];
        }
        const slot = key === undefined ? undefined : slots.get(key);
        if (!slot || key === undefined) {
            if ([...slots.values()].some((s) => s.material)) return { fit: 'mismatch', spend };
            continue;
        }
        if (!sameMaterial(slot, need)) return { fit: 'mismatch', spend };
        if (need.usedG === null || need.usedG === undefined) continue;
        const total = (spend.get(key) ?? 0) + need.usedG;
        spend.set(key, total);
        const left = ledger.get(key) ?? slot.remainingG;
        if (left !== null && left !== undefined && left < total) fit = 'short';
    }
    return { fit, spend };
}

@Injectable()
export class QueueService extends EventEmitter<{ bed_cleared: [printerId: string, outcome: 'good' | 'bad'] }> {
    private readonly log = new Logger(QueueService.name);
    private readonly watches = new Map<string, Watch>();
    private readonly bridges = new Map<string, PrinterBridge>();
    private readonly detached = new Map<string, () => void>();
    private readonly startedAt = new Map<string, number>();
    private readonly inFlight = new Set<string>();
    private readonly heldNotified = new Set<string>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gcode: GcodeService,
        private readonly notifications: NotificationService,
        private readonly spoolman: SpoolmanService,
        private readonly localSpools: LocalSpoolService,
    ) {
        super();
    }

    attach(bridge: PrinterBridge): void {
        this.bridges.set(bridge.id, bridge);
        const watch: Watch = {
            lastKobraState: '',
            active: false,
            armed: false,
            timer: null,
            startAt: null,
            notified: false,
        };
        this.watches.set(bridge.id, watch);
        const onState = (state: PrinterLiveState) => void this.onState(bridge, watch, state);
        const onLight = () => {
            if (!bridge.settings.lightTrigger) return;
            void this.confirmBedClear(bridge.id, 'good', true).catch((e) =>
                this.log.warn(`Queue: light trigger failed: ${(e as Error).message}`),
            );
        };
        bridge.on('state', onState);
        bridge.on('light_trigger', onLight);
        this.detached.set(bridge.id, () => {
            bridge.off('state', onState);
            bridge.off('light_trigger', onLight);
        });
    }

    detach(printerId: string): void {
        this.detached.get(printerId)?.();
        this.detached.delete(printerId);
        const w = this.watches.get(printerId);
        if (w?.timer) clearTimeout(w.timer);
        this.watches.delete(printerId);
        this.bridges.delete(printerId);
        this.startedAt.delete(printerId);
        for (const key of this.heldNotified) if (key.startsWith(`${printerId}:`)) this.heldNotified.delete(key);
    }

    private async onState(bridge: PrinterBridge, w: Watch, s: PrinterLiveState): Promise<void> {
        const prev = w.lastKobraState;
        w.lastKobraState = s.kobraState;
        if (prev === s.kobraState) return;
        if (ACTIVE_PRINT_STATES.has(s.kobraState)) {
            w.active = true;
            w.armed = false;
            w.notified = false;
            cancelTimer(w);
            await this.setAwaiting(bridge.id, false);
            return;
        }
        if (ENDED_STATES.has(s.kobraState)) {
            const ended = w.active || s.kobraState === 'finished';
            w.active = false;
            if (!ended) return;
            if (bridge.settings.queueBedClearConfirm || s.kobraState !== 'finished') {
                await this.setAwaiting(bridge.id, true);
                await this.notifyNext(bridge, w, true);
                return;
            }
            w.armed = true;
            return;
        }
        if (!w.armed || s.kobraState !== 'free' || !s.connected) return;
        w.armed = false;
        if (bridge.settings.queueAutoStart && (await this.nextFor(bridge.id))) this.scheduleStart(bridge, w);
        await this.notifyNext(bridge, w, false);
    }

    private async notifyNext(bridge: PrinterBridge, w: Watch, bedClear: boolean): Promise<void> {
        if (w.notified) return;
        const next = await this.nextFor(bridge.id);
        if (!next) return;
        w.notified = true;
        if (bedClear) this.log.log(`Queue: ${next.filename} waits for the bed of ${bridge.config.name} to be cleared`);
        this.notifications.emitCustom(bridge.id, bridge.config.name, 'queue_next', {
            filename: next.filename,
            bedClear,
        });
    }

    private scheduleStart(bridge: PrinterBridge, w: Watch): number {
        cancelTimer(w);
        const delayMs = bridge.settings.queueAutoStartDelaySec * 1000;
        w.startAt = Date.now() + delayMs;
        this.log.log(`Queue: auto-start on ${bridge.config.name} in ${delayMs / 1000} s`);
        w.timer = setTimeout(() => {
            w.timer = null;
            w.startAt = null;
            void this.dispatch(bridge.id).catch((e) =>
                this.log.warn(`Queue: auto-start failed: ${(e as Error).message}`),
            );
        }, delayMs);
        return w.startAt;
    }

    cancelAutoStart(printerId: string): boolean {
        const w = this.watches.get(printerId);
        if (!w?.timer) return false;
        cancelTimer(w);
        this.log.log(`Queue: auto-start on ${printerId} cancelled`);
        return true;
    }

    private async setAwaiting(printerId: string, awaiting: boolean): Promise<void> {
        await this.prisma.client.printer
            .updateMany({ where: { id: printerId, awaitingBedClear: !awaiting }, data: { awaitingBedClear: awaiting } })
            .catch(() => null);
    }

    private recentlyStarted(printerId: string): boolean {
        return Date.now() - (this.startedAt.get(printerId) ?? 0) < START_COOLDOWN_MS;
    }

    private serveBase(bridge: PrinterBridge): string {
        return `http://${localIpFor(bridge.config.ip)}:${bridge.config.httpPort}`;
    }

    private async printers(): Promise<Printer[]> {
        return this.prisma.client.printer.findMany({ orderBy: { createdAt: 'asc' } });
    }

    private targetInfo(p: Printer): PrinterTargetInfo {
        const { profile } = PrintersService.parseSettings(p.settings);
        const specs = printerSpecs(p.modeId);
        return {
            id: p.id,
            model: p.model,
            tags: profile.tags,
            nozzleMm: profile.nozzleMm ?? specs?.defaultNozzleMm ?? null,
            buildVolumeMm: specs?.buildVolumeMm ?? null,
        };
    }

    private live(printerId: string): PrinterLiveState | null {
        return this.bridges.get(printerId)?.snapshot() ?? null;
    }

    private ready(p: Printer, live: PrinterLiveState | null): boolean {
        return Boolean(
            live?.connected &&
                !p.maintenance &&
                !p.awaitingBedClear &&
                (live.kobraState === 'free' || TERMINAL_PRINT_STATES.has(live.kobraState)),
        );
    }

    async stock(): Promise<StockFilament[] | null> {
        const out: StockFilament[] = [];
        const spools = await this.spoolman.spools();
        if (spools) {
            for (const s of spools) {
                if (s.filament.material) {
                    out.push({
                        material: s.filament.material,
                        colorHex: s.filament.color_hex ? `#${s.filament.color_hex.replace(/^#/, '')}` : '',
                    });
                }
            }
        } else if (this.localSpools.active) {
            for (const s of await this.localSpools.list()) out.push({ material: s.material, colorHex: s.colorHex });
        }
        for (const bridge of this.bridges.values()) {
            const live = bridge.snapshot();
            for (const slot of live.amsSlots) {
                if (slot.type) out.push({ material: slot.type, colorHex: rgbHex(slot.color) });
            }
        }
        return out.length ? out : null;
    }

    async slotFilaments(printerId: string): Promise<Map<string, SlotFilament>> {
        const out = new Map<string, SlotFilament>();
        const live = this.live(printerId);
        const spools = await this.spoolman.spools();
        const spoolmanMap = this.spoolman.slotMap(printerId);
        const localMap = this.localSpools.slotMap(printerId);
        const local = localMap.size ? await this.localSpools.list(true) : [];
        const spoolFor = (key: number): { material: string; colorHex: string; remainingG: number | null } | null => {
            const sm = spools?.find((s) => s.id === spoolmanMap.get(key));
            if (sm) {
                return {
                    material: sm.filament.material ?? '',
                    colorHex: sm.filament.color_hex ? `#${sm.filament.color_hex.replace(/^#/, '')}` : '',
                    remainingG: sm.remaining_weight ?? null,
                };
            }
            const ls = local.find((s) => s.id === localMap.get(key));
            return ls ? { material: ls.material, colorHex: ls.colorHex, remainingG: ls.remainingG } : null;
        };
        if (!live || live.externalSpoolOnly || !live.amsSlots.length) {
            const spool = spoolFor(0);
            out.set(EXTERNAL_SLOT_KEY, spool ?? { material: '', colorHex: '', remainingG: null });
            return out;
        }
        for (const slot of live.amsSlots) {
            if (!slotUsableForPrint(slot, live.filamentMode)) continue;
            const spool = spoolFor(slot.globalIndex);
            out.set(String(slot.globalIndex), {
                material: slot.type || spool?.material || '',
                colorHex: slot.type ? rgbHex(slot.color) : (spool?.colorHex ?? ''),
                remainingG: spool?.remainingG ?? null,
            });
        }
        return out;
    }

    private usedFilaments(row: Row): GcodeFilament[] {
        return parseFilaments(row.file.filaments).filter((f) => f.isUsed);
    }

    async check(fileId: string, target: QueueTarget): Promise<QueueCheckDto> {
        const file = await this.prisma.client.gcodeFile.findUnique({ where: { id: fileId } });
        if (!file) throw new NotFoundException(m.api_file_not_found());
        const stock = stockReasons(
            parseFilaments(file.filaments).filter((f) => f.isUsed),
            await this.stock(),
        );
        const printers = (await this.printers()).map((p) => {
            const info = this.targetInfo(p);
            const reasons: CompatReason[] = isTargeted(target, info) ? [] : ['target'];
            reasons.push(...staticReasons(file, info), ...stock);
            return { printerId: p.id, name: p.name, reasons };
        });
        return { ok: printers.some((p) => blockingReasons(p.reasons).length === 0), printers };
    }

    async status(printerId: string): Promise<QueueStatusDto> {
        const p = await this.prisma.client.printer.findUnique({ where: { id: printerId } });
        const next = await this.nextFor(printerId);
        return {
            awaitingBedClear: Boolean(p?.awaitingBedClear),
            maintenance: Boolean(p?.maintenance),
            nextFilename: next?.filename ?? null,
            autoStartAt: startAtOf(this.watches.get(printerId)),
        };
    }

    async setMaintenance(printerId: string, enabled: boolean): Promise<QueueStatusDto> {
        const done = await this.prisma.client.printer.updateMany({
            where: { id: printerId },
            data: { maintenance: enabled },
        });
        if (!done.count) throw new NotFoundException(m.api_bridge_not_found());
        this.log.log(`Queue: ${printerId} ${enabled ? 'in' : 'out of'} maintenance`);
        if (!enabled) void this.maybeDispatch(printerId);
        return this.status(printerId);
    }

    async confirmBedClear(
        printerId: string,
        outcome: 'good' | 'bad' = 'good',
        immediate = false,
    ): Promise<BedClearResultDto> {
        await this.setAwaiting(printerId, false);
        if (outcome === 'bad') await this.reject(printerId);
        this.emit('bed_cleared', printerId, outcome);
        const bridge = this.bridges.get(printerId);
        const w = this.watches.get(printerId);
        if (!bridge?.settings.queueAutoStart || !w) return { started: null, startsAt: null };
        if (immediate || bridge.settings.queueAutoStartDelaySec <= 0) {
            cancelTimer(w);
            return { started: await this.dispatch(printerId).catch(() => null), startsAt: null };
        }
        if (!(await this.nextFor(printerId))) return { started: null, startsAt: null };
        return { started: null, startsAt: new Date(this.scheduleStart(bridge, w)).toISOString() };
    }

    private async reject(printerId: string): Promise<void> {
        const job = await this.prisma.client.printJob.findFirst({
            where: { printerId, status: { not: 'printing' } },
            orderBy: { startedAt: 'desc' },
        });
        if (!job) return;
        await this.prisma.client.printJob.update({
            where: { id: job.id },
            data: { status: 'error', failureReason: job.failureReason || 'quality' },
        });
        if (job.fileId) {
            await this.add(job.fileId, [], true, {}, { printerId, targetTags: [] }, false).catch(() => null);
            this.log.log(`Queue: ${job.filename} rejected, back at the front for ${printerId}`);
        }
    }

    private async rows(): Promise<Row[]> {
        return this.prisma.client.queueItem.findMany({ orderBy: { position: 'asc' }, include: { file: true } });
    }

    async list(): Promise<QueueItemDto[]> {
        const [rows, printers] = await Promise.all([this.rows(), this.printers()]);
        const infos = printers.map((p) => ({ p, info: this.targetInfo(p), live: this.live(p.id) }));
        const slots = new Map<string, Map<string, SlotFilament>>();
        for (const { p } of infos) slots.set(p.id, await this.slotFilaments(p.id));
        const ledgers = new Map<string, Map<string, number>>(infos.map(({ p }) => [p.id, new Map()]));
        return rows.map((row) => {
            const target = { printerId: row.printerId, targetTags: parseTags(row.targetTags) };
            const candidates = infos.filter(
                ({ info }) => isTargeted(target, info) && staticReasons(row.file, info).length === 0,
            );
            const used = this.usedFilaments(row);
            const options = parseQueueOptions(row.options);
            let waiting: QueueWaitReason = 'no_printer';
            const rank: QueueWaitReason[] = [
                'no_printer',
                'offline',
                'maintenance',
                'busy',
                'bed_clear',
                'filament',
                'manual',
            ];
            const better = (r: QueueWaitReason) => {
                if (rank.indexOf(r) > rank.indexOf(waiting)) waiting = r;
            };
            for (const { p, live } of candidates) {
                if (!live?.connected) {
                    better('offline');
                    continue;
                }
                if (p.maintenance) {
                    better('maintenance');
                    continue;
                }
                const ledger = ledgers.get(p.id) as Map<string, number>;
                const { fit, spend } = filamentFit(
                    used,
                    options.filamentAssignments,
                    slots.get(p.id) ?? new Map(),
                    ledger,
                );
                if (fit !== 'ok') {
                    better('filament');
                    continue;
                }
                const idle = live.kobraState === 'free' || TERMINAL_PRINT_STATES.has(live.kobraState);
                better(!idle || this.recentlyStarted(p.id) ? 'busy' : p.awaitingBedClear ? 'bed_clear' : 'manual');
                for (const [key, grams] of spend) {
                    const start = ledger.get(key) ?? slots.get(p.id)?.get(key)?.remainingG ?? null;
                    if (start !== null) ledger.set(key, start - grams);
                }
                break;
            }
            return toDto(
                row,
                waiting,
                candidates.map(({ p }) => p.id),
            );
        });
    }

    async listFor(printerId: string): Promise<QueueItemDto[]> {
        const all = await this.list();
        return all.filter((item) => item.candidates.includes(printerId) || item.printerId === printerId);
    }

    async nextFor(printerId: string): Promise<QueueItemDto | null> {
        return (await this.listFor(printerId))[0] ?? null;
    }

    async add(
        fileId: string,
        excludedObjects: string[],
        first = false,
        options: QueuePrintOptions = {},
        target: QueueTarget = { printerId: null, targetTags: [] },
        validate = true,
    ): Promise<QueueItemDto> {
        const file = await this.prisma.client.gcodeFile.findUnique({ where: { id: fileId } });
        if (!file) throw new NotFoundException(m.api_file_not_found());
        if (validate) {
            const check = await this.check(fileId, target);
            if (!check.ok) {
                throw new UnprocessableEntityException(
                    m.api_queue_no_printer({ name: file.filename, details: describeRefusal(check.printers) }),
                );
            }
        }
        const edge = await this.prisma.client.queueItem.findFirst({ orderBy: { position: first ? 'asc' : 'desc' } });
        const position = first ? (edge?.position ?? 1) - 1 : (edge?.position ?? 0) + 1;
        const row = await this.prisma.client.queueItem.create({
            data: {
                printerId: target.printerId,
                targetTags: JSON.stringify(target.targetTags),
                fileId,
                position,
                excludedObjects: JSON.stringify(excludedObjects),
                options: JSON.stringify(queuePrintOptionsSchema.parse(options)),
            },
            include: { file: true },
        });
        for (const id of this.bridges.keys()) void this.maybeDispatch(id);
        return toDto(row, null, []);
    }

    async addByFilename(printerId: string, filename: string): Promise<QueueItemDto> {
        const file = await this.gcode.getByFilename(filename);
        if (!file) throw new NotFoundException(m.api_unknown_store_file({ name: filename }));
        return this.add(file.id, [], false, {}, { printerId, targetTags: [] }, false);
    }

    async remove(id: string): Promise<void> {
        await this.prisma.client.queueItem.deleteMany({ where: { id } });
    }

    async clear(printerId?: string): Promise<void> {
        await this.prisma.client.queueItem.deleteMany({ where: printerId ? { printerId } : undefined });
    }

    async reorder(ids: string[]): Promise<QueueItemDto[]> {
        await this.prisma.client.$transaction(
            ids.map((id, i) => this.prisma.client.queueItem.updateMany({ where: { id }, data: { position: i + 1 } })),
        );
        return this.list();
    }

    private async maybeDispatch(printerId: string): Promise<void> {
        const bridge = this.bridges.get(printerId);
        const p = await this.prisma.client.printer.findUnique({ where: { id: printerId } });
        if (!bridge || !p || !bridge.settings.queueAutoStart || !this.ready(p, bridge.snapshot())) return;
        if (this.watches.get(printerId)?.timer) return;
        if (this.recentlyStarted(printerId)) return;
        await this.dispatch(printerId).catch(() => null);
    }

    async dispatch(printerId: string): Promise<QueueItemDto> {
        if (this.inFlight.has(printerId)) throw new Error(m.api_queue_busy());
        this.inFlight.add(printerId);
        try {
            return await this.dispatchLocked(printerId);
        } finally {
            this.inFlight.delete(printerId);
        }
    }

    private async dispatchLocked(printerId: string): Promise<QueueItemDto> {
        const bridge = this.bridges.get(printerId);
        if (!bridge) throw new NotFoundException(m.api_bridge_not_found());
        const p = await this.prisma.client.printer.findUnique({ where: { id: printerId } });
        if (!p) throw new NotFoundException(m.api_bridge_not_found());
        const s = bridge.snapshot();
        if (s.printState === 'printing' || s.printState === 'paused' || this.recentlyStarted(printerId)) {
            throw new Error(m.api_queue_busy());
        }
        if (p.maintenance) throw new Error(m.api_queue_maintenance());
        const info = this.targetInfo(p);
        const slots = await this.slotFilaments(printerId);
        const rows = await this.rows();
        const held: Row[] = [];
        const next = rows.find((row) => {
            const target = { printerId: row.printerId, targetTags: parseTags(row.targetTags) };
            if (!isTargeted(target, info) || staticReasons(row.file, info).length) return false;
            const options = parseQueueOptions(row.options);
            const fits =
                filamentFit(this.usedFilaments(row), options.filamentAssignments, slots, new Map()).fit === 'ok';
            if (!fits) held.push(row);
            return fits;
        });
        this.notifyHeld(bridge, held);
        if (!next) throw new NotFoundException(m.api_queue_empty());
        const dto = toDto(next, null, [printerId]);
        this.startedAt.set(printerId, Date.now());
        try {
            await bridge.printStoredFile(dto.fileId, {
                ...dto.options,
                serveBase: this.serveBase(bridge),
                excludedObjects: dto.excludedObjects,
            });
        } catch (e) {
            this.startedAt.delete(printerId);
            throw e;
        }
        await this.prisma.client.queueItem.delete({ where: { id: next.id } }).catch(() => null);
        const watch = this.watches.get(printerId);
        if (watch) cancelTimer(watch);
        await this.setAwaiting(printerId, false);
        this.log.log(`Queue: started ${dto.filename} on ${bridge.config.name}`);
        return dto;
    }

    private notifyHeld(bridge: PrinterBridge, held: Row[]): void {
        for (const row of held) {
            const key = `${bridge.id}:${row.id}`;
            if (this.heldNotified.has(key)) continue;
            this.heldNotified.add(key);
            this.log.log(`Queue: ${row.file.filename} held on ${bridge.config.name}, not enough filament`);
            this.notifications.emitCustom(bridge.id, bridge.config.name, 'queue_filament', {
                filename: row.file.filename,
            });
        }
    }

    startNext(printerId: string): Promise<QueueItemDto> {
        return this.dispatch(printerId);
    }

    isIdle(printerId: string): boolean {
        const b = this.bridges.get(printerId);
        if (!b) return false;
        const s = b.snapshot();
        return s.connected && (s.kobraState === 'free' || TERMINAL_PRINT_STATES.has(s.kobraState));
    }
}

const COMPAT_TEXT: Record<CompatReason, () => string> = {
    target: m.compat_target,
    model: m.compat_model,
    nozzle: m.compat_nozzle,
    size: m.compat_size,
    material: m.compat_material,
    color: m.compat_color,
};

export function describeRefusal(printers: QueueCheckDto['printers']): string {
    return printers
        .map(
            (p) =>
                `${p.name}: ${blockingReasons(p.reasons)
                    .map((r) => COMPAT_TEXT[r]())
                    .join(', ')}`,
        )
        .join('; ');
}

const ENDED_STATES = new Set([...TERMINAL_PRINT_STATES, 'failed']);

function cancelTimer(w: Watch): void {
    if (w.timer) clearTimeout(w.timer);
    w.timer = null;
    w.startAt = null;
}

function startAtOf(w: Watch | undefined): string | null {
    return w?.startAt ? new Date(w.startAt).toISOString() : null;
}

function toDto(r: Row, waiting: QueueWaitReason | null, candidates: string[]): QueueItemDto {
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
        targetTags: parseTags(r.targetTags),
        fileId: r.fileId,
        filename: r.file.filename,
        thumbnail: r.file.thumbnail,
        estPrintTimeSec: r.file.estPrintTimeSec,
        position: r.position,
        excludedObjects: excluded,
        options: parseQueueOptions(r.options),
        createdAt: r.createdAt.toISOString(),
        waiting,
        candidates,
    };
}

export function parseQueueOptions(raw: string): QueuePrintOptions {
    try {
        const v = queuePrintOptionsSchema.safeParse(JSON.parse(raw));
        return v.success ? v.data : {};
    } catch {
        return {};
    }
}
