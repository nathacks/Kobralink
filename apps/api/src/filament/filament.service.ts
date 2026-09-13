import fs from 'node:fs';
import path from 'node:path';
import type {
    AmsSlot,
    FilamentProfile,
    ImportProfilesResult,
    SlotFilamentInfo,
    SlotProfileRef,
} from '@kobralink/shared';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveSlotProfile, lookupFilamentId, parseOrcaProfile } from './filament-library';

@Injectable()
export class FilamentService implements OnModuleInit {
    private readonly log = new Logger(FilamentService.name);
    private system: FilamentProfile[] = [];
    private user: FilamentProfile[] = [];
    private merged: FilamentProfile[] = [];
    private readonly slotOverrides = new Map<string, Map<number, SlotProfileRef>>();
    private initialized = false;

    constructor(private readonly prisma: PrismaService) {}

    async onModuleInit(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;
        this.loadSystem();
        await this.reloadUser();
        const rows = await this.prisma.client.slotProfile.findMany();
        for (const r of rows) {
            this.printerMap(r.printerId).set(r.slotIndex, { vendor: r.vendor, name: r.name, id: r.filamentId });
        }
        this.log.log(`${this.system.length} profils système, ${this.user.length} profils utilisateur`);
    }

    private loadSystem(): void {
        const file = path.join(loadEnv().assetsDir, 'orca_filaments.json');
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as FilamentProfile[];
            this.system = raw.map((p) => ({
                id: p.id,
                name: p.name,
                vendor: p.vendor,
                type: p.type,
                color: p.color ?? '',
            }));
        } catch (e) {
            this.log.warn(`orca_filaments.json illisible (${file}): ${(e as Error).message}`);
            this.system = [];
        }
        this.rebuild();
    }

    private async reloadUser(): Promise<void> {
        const rows = await this.prisma.client.filamentProfile.findMany({
            orderBy: [{ vendor: 'asc' }, { name: 'asc' }],
        });
        this.user = rows.map((r) => ({
            id: r.filamentId,
            name: r.name,
            vendor: r.vendor,
            type: r.type,
            color: r.color,
            isUser: true,
        }));
        this.rebuild();
    }

    private rebuild(): void {
        this.merged = [...this.system, ...this.user];
    }

    private printerMap(printerId: string): Map<number, SlotProfileRef> {
        let m = this.slotOverrides.get(printerId);
        if (!m) {
            m = new Map();
            this.slotOverrides.set(printerId, m);
        }
        return m;
    }

    library(): FilamentProfile[] {
        return this.merged;
    }

    profiles(filter: { type?: string; vendor?: string } = {}): FilamentProfile[] {
        const type = filter.type?.toUpperCase().trim();
        const vendor = filter.vendor?.trim();
        return this.merged.filter((p) => (!type || p.type.toUpperCase() === type) && (!vendor || p.vendor === vendor));
    }

    userProfiles(): FilamentProfile[] {
        return this.user;
    }

    vendors(): string[] {
        return [...new Set(this.merged.map((p) => p.vendor))].sort((a, b) => a.localeCompare(b));
    }

    slotOverride(printerId: string, slotIndex: number): SlotProfileRef | null {
        return this.slotOverrides.get(printerId)?.get(slotIndex) ?? null;
    }

    resolveSlot(printerId: string, slotIndex: number, amsMaterial: string) {
        return effectiveSlotProfile(this.merged, this.slotOverride(printerId, slotIndex), amsMaterial);
    }

    slotInfos(printerId: string, slots: AmsSlot[]): SlotFilamentInfo[] {
        return [...slots]
            .sort((a, b) => a.globalIndex - b.globalIndex)
            .map((s) => {
                const { profile, source } = this.resolveSlot(printerId, s.globalIndex, s.type);
                return {
                    slotIndex: s.globalIndex,
                    material: s.type,
                    colorHex: `#${s.color
                        .map((c) => c.toString(16).padStart(2, '0'))
                        .join('')
                        .toUpperCase()}`,
                    status: s.status === 5 ? 'loaded' : 'empty',
                    profile,
                    override: this.slotOverride(printerId, s.globalIndex),
                    source,
                };
            });
    }

    async setSlotProfile(
        printerId: string,
        slotIndex: number,
        vendor: string,
        name: string,
    ): Promise<SlotProfileRef | null> {
        const map = this.printerMap(printerId);
        if (vendor && name) {
            const ref: SlotProfileRef = { vendor, name, id: lookupFilamentId(this.merged, vendor, name) };
            await this.prisma.client.slotProfile.upsert({
                where: { printerId_slotIndex: { printerId, slotIndex } },
                create: { printerId, slotIndex, vendor, name, filamentId: ref.id },
                update: { vendor, name, filamentId: ref.id },
            });
            map.set(slotIndex, ref);
            return ref;
        }
        await this.prisma.client.slotProfile.deleteMany({ where: { printerId, slotIndex } });
        map.delete(slotIndex);
        return null;
    }

    forgetPrinter(printerId: string): void {
        this.slotOverrides.delete(printerId);
    }

    async importProfiles(files: { originalname: string; buffer: Buffer }[]): Promise<ImportProfilesResult> {
        const added: FilamentProfile[] = [];
        let skipped = 0;
        const consider = (blob: Uint8Array) => {
            try {
                const parsed = parseOrcaProfile(JSON.parse(Buffer.from(blob).toString('utf8')), this.system);
                if (parsed) added.push(parsed);
                else skipped++;
            } catch {
                skipped++;
            }
        };
        for (const f of files) {
            const lower = f.originalname.toLowerCase();
            if (lower.endsWith('.zip')) {
                let entries: Record<string, Uint8Array>;
                try {
                    entries = unzipSync(new Uint8Array(f.buffer), {
                        filter: (e) => e.name.toLowerCase().endsWith('.json'),
                    });
                } catch {
                    throw new Error(`Archive ZIP invalide : ${f.originalname}`);
                }
                for (const blob of Object.values(entries)) consider(blob);
            } else if (lower.endsWith('.json')) {
                consider(new Uint8Array(f.buffer));
            } else {
                skipped++;
            }
        }
        if (added.length) {
            await this.prisma.client.$transaction(
                added.map((p) =>
                    this.prisma.client.filamentProfile.upsert({
                        where: { vendor_name: { vendor: p.vendor, name: p.name } },
                        create: { filamentId: p.id, name: p.name, vendor: p.vendor, type: p.type, color: p.color },
                        update: { filamentId: p.id, type: p.type, color: p.color },
                    }),
                ),
            );
            await this.reloadUser();
        }
        return { added: added.length, skipped, totalUser: this.user.length };
    }

    async deleteUserProfiles(vendor?: string, name?: string): Promise<{ removed: number; totalUser: number }> {
        const where = vendor && name ? { vendor, name } : {};
        const { count } = await this.prisma.client.filamentProfile.deleteMany({ where });
        await this.reloadUser();
        return { removed: count, totalUser: this.user.length };
    }
}
