import type { SpoolmanSpool, SpoolmanStatus } from '@kobralink/shared';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { m } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class SpoolmanService implements OnModuleInit {
    private readonly log = new Logger(SpoolmanService.name);
    private reachable = false;
    private lastCheck = 0;
    private readonly maps = new Map<string, Map<number, number>>();
    private initialized = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SettingsService,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        const rows = await this.prisma.client.spoolAssignment.findMany();
        for (const r of rows) this.printerMap(r.printerId).set(r.slotIndex, r.spoolId);
        this.settings.on('change', () => {
            this.lastCheck = 0;
            void this.checkHealth();
        });
        void this.checkHealth();
    }

    private printerMap(printerId: string): Map<number, number> {
        let m = this.maps.get(printerId);
        if (!m) {
            m = new Map();
            this.maps.set(printerId, m);
        }
        return m;
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
        try {
            await this.req('GET', '/api/v1/health');
            if (!this.reachable) this.log.log(`Spoolman reachable: ${this.serverUrl}`);
            this.reachable = true;
        } catch (e) {
            if (this.reachable) this.log.warn(`Spoolman unreachable: ${(e as Error).message}`);
            this.reachable = false;
        }
        return this.reachable;
    }

    async listSpools(): Promise<SpoolmanSpool[]> {
        if (!this.configured) throw new Error(m.api_spoolman_not_configured());
        const spools = await this.req<SpoolmanSpool[]>('GET', '/api/v1/spool?allow_archived=false');
        this.reachable = true;
        return spools;
    }

    async useFilament(spoolId: number, lengthMm: number): Promise<void> {
        await this.req('PUT', `/api/v1/spool/${spoolId}/use`, { use_length: Math.round(lengthMm * 100) / 100 });
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
        const m = this.printerMap(printerId);
        m.clear();
        for (const [k, v] of entries) m.set(k, v);
        return Object.fromEntries(entries.map(([k, v]) => [String(k), v]));
    }

    forgetPrinter(printerId: string): void {
        this.maps.delete(printerId);
    }
}
