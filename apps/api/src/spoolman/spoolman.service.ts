import { type SpoolmanPricing, type SpoolmanSpool, type SpoolmanStatus, spoolmanPricing } from '@kobralink/shared';
import { Injectable, Logger, type OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { FilamentUsageSink } from '../bridge/printer-bridge';
import { m } from '../i18n/locale';
import { NotificationService } from '../notifications/notification.service';
import { PrintersService } from '../printers/printers.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

const CACHE_MS = 60_000;
const FLUSH_MS = 60_000;

@Injectable()
export class SpoolmanService implements OnModuleInit, OnModuleDestroy, FilamentUsageSink {
    readonly name = 'spoolman';
    private readonly log = new Logger(SpoolmanService.name);
    private reachable = false;
    private lastCheck = 0;
    private readonly maps = new Map<string, Map<number, number>>();
    private initialized = false;
    private cache: { at: number; spools: SpoolmanSpool[] } | null = null;
    private readonly lowAlerted = new Set<number>();
    private flushing: Promise<number> | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SettingsService,
        private readonly printers: PrintersService,
        private readonly notifications: NotificationService,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        const rows = await this.prisma.client.spoolAssignment.findMany();
        for (const r of rows) this.printerMap(r.printerId).set(r.slotIndex, r.spoolId);
        this.settings.on('change', () => {
            this.lastCheck = 0;
            this.cache = null;
            void this.checkHealth();
        });
        void this.checkHealth();
        this.timer = setInterval(() => void this.flushPending(), FLUSH_MS);
        this.timer.unref?.();
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }

    private printerMap(printerId: string): Map<number, number> {
        let map = this.maps.get(printerId);
        if (!map) {
            map = new Map();
            this.maps.set(printerId, map);
        }
        return map;
    }

    get serverUrl(): string {
        return this.settings.get().spoolmanUrl.replace(/\/+$/, '');
    }

    get syncRateSec(): number {
        return this.settings.get().spoolmanSyncRateSec;
    }

    get configured(): boolean {
        return Boolean(this.serverUrl);
    }

    private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        try {
            const res = await fetch(`${this.serverUrl}${path}`, {
                method,
                headers: body ? { 'content-type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
                signal: ctrl.signal,
            });
            if (!res.ok) throw new Error(`Spoolman HTTP ${res.status}`);
            return (await res.json()) as T;
        } finally {
            clearTimeout(timer);
        }
    }

    async checkHealth(force = false): Promise<boolean> {
        if (!this.configured) {
            this.reachable = false;
            return false;
        }
        const now = Date.now();
        if (!force && now - this.lastCheck < 30_000) return this.reachable;
        this.lastCheck = now;
        const was = this.reachable;
        try {
            await this.req('GET', '/api/v1/health');
            if (!was) this.log.log(`Spoolman reachable: ${this.serverUrl}`);
            this.reachable = true;
        } catch (e) {
            if (was) this.log.warn(`Spoolman unreachable: ${(e as Error).message}`);
            this.reachable = false;
        }
        if (!was && this.reachable) void this.flushPending();
        return this.reachable;
    }

    async listSpools(): Promise<SpoolmanSpool[]> {
        if (!this.configured) throw new Error(m.api_spoolman_not_configured());
        const spools = await this.req<SpoolmanSpool[]>('GET', '/api/v1/spool?allow_archived=false');
        this.reachable = true;
        this.cache = { at: Date.now(), spools };
        return spools;
    }

    async spools(): Promise<SpoolmanSpool[] | null> {
        if (!this.configured) return null;
        try {
            return this.cache && Date.now() - this.cache.at < CACHE_MS ? this.cache.spools : await this.listSpools();
        } catch {
            return null;
        }
    }

    async describe(spoolId: string | number): Promise<SpoolmanPricing | null> {
        const spool = (await this.spools())?.find((s) => s.id === Number(spoolId));
        return spool ? spoolmanPricing(spool) : null;
    }

    async useFilament(spoolId: string | number, lengthMm: number, printerId = ''): Promise<void> {
        const id = Number(spoolId);
        try {
            const spool = await this.put(id, lengthMm);
            await this.checkLow(printerId, spool);
        } catch (e) {
            await this.prisma.client.spoolmanPendingUse.create({ data: { spoolId: id, lengthMm, printerId } });
            this.log.warn(
                `Spoolman unreachable, ${lengthMm.toFixed(1)} mm for spool ${id} kept to retry: ${(e as Error).message}`,
            );
        }
    }

    private put(spoolId: number, lengthMm: number): Promise<SpoolmanSpool> {
        return this.req<SpoolmanSpool>('PUT', `/api/v1/spool/${spoolId}/use`, {
            use_length: Math.round(lengthMm * 100) / 100,
        });
    }

    async flushPending(): Promise<number> {
        if (this.flushing) return this.flushing;
        this.flushing = (async () => {
            if (!this.configured) return 0;
            const rows = await this.prisma.client.spoolmanPendingUse.findMany({ orderBy: { createdAt: 'asc' } });
            let sent = 0;
            for (const row of rows) {
                try {
                    const spool = await this.put(row.spoolId, row.lengthMm);
                    await this.prisma.client.spoolmanPendingUse.delete({ where: { id: row.id } });
                    sent += 1;
                    await this.checkLow(row.printerId, spool);
                } catch {
                    break;
                }
            }
            if (sent) this.log.log(`Spoolman: ${sent} delayed usage report(s) sent`);
            return sent;
        })().finally(() => {
            this.flushing = null;
        });
        return this.flushing;
    }

    async pendingCount(): Promise<number> {
        return this.prisma.client.spoolmanPendingUse.count();
    }

    private async checkLow(printerId: string, spool: SpoolmanSpool | undefined): Promise<void> {
        if (!printerId || !spool || spool.remaining_weight === undefined) return;
        const printer = await this.printers.findOne(printerId).catch(() => null);
        if (!printer) return;
        const threshold = PrintersService.parseSettings(printer.settings).alerts.spoolLowG;
        if (threshold <= 0) return;
        if (spool.remaining_weight > threshold) {
            this.lowAlerted.delete(spool.id);
            return;
        }
        if (this.lowAlerted.has(spool.id)) return;
        this.lowAlerted.add(spool.id);
        this.notifications.emitCustom(printerId, printer.name, 'alert_spool_low', {
            spool: spool.filament?.name ?? `#${spool.id}`,
            grams: Math.round(spool.remaining_weight),
        });
    }

    status(printerId: string): SpoolmanStatus {
        return {
            configured: this.configured,
            reachable: this.configured && this.reachable,
            server: this.serverUrl,
            syncRateSec: this.syncRateSec,
            slotSpools: Object.fromEntries([...this.printerMap(printerId)].map(([k, v]) => [String(k), v])),
        };
    }

    slotMap(printerId: string): ReadonlyMap<number, number> {
        return this.printerMap(printerId);
    }

    async setSlotMap(printerId: string, slotMap: Record<string, number>): Promise<Record<string, number>> {
        const entries = Object.entries(slotMap)
            .map(([k, v]) => [Number(k), Number(v)] as const)
            .filter(([k, v]) => Number.isInteger(k) && k >= 0 && Number.isInteger(v) && v > 0);
        await this.prisma.client.$transaction([
            this.prisma.client.spoolAssignment.deleteMany({ where: { printerId } }),
            ...entries.map(([slotIndex, spoolId]) =>
                this.prisma.client.spoolAssignment.create({ data: { printerId, slotIndex, spoolId } }),
            ),
        ]);
        const map = this.printerMap(printerId);
        map.clear();
        for (const [k, v] of entries) map.set(k, v);
        return Object.fromEntries(entries.map(([k, v]) => [String(k), v]));
    }

    forgetPrinter(printerId: string): void {
        this.maps.delete(printerId);
    }
}
