import {
    DEFAULT_DENSITY,
    filamentWeightG,
    type SpoolUsageEntry,
    type StatsBucket,
    type StatsDto,
    type StatsFileEntry,
    type StatsPrinterEntry,
} from '@kobralink/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

const DAILY_MAX_DAYS = 90;

type Spool = { diameterMm: number; densityGcm3: number; material: string; price: number; initialWeightG: number };

@Injectable()
export class StatsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SettingsService,
    ) {}

    async compute(printerId?: string, days = 0): Promise<StatsDto> {
        const since = days > 0 ? startOfDay(new Date(Date.now() - (days - 1) * 86_400_000)) : undefined;
        const [jobs, printerRows, spoolRows] = await Promise.all([
            this.prisma.client.printJob.findMany({
                where: { ...(printerId ? { printerId } : {}), ...(since ? { startedAt: { gte: since } } : {}) },
                include: { file: { select: { thumbnail: true, id: true } } },
                orderBy: { startedAt: 'asc' },
            }),
            this.prisma.client.printer.findMany({ select: { id: true, name: true } }),
            this.prisma.client.localSpool.findMany({
                select: {
                    id: true,
                    diameterMm: true,
                    densityGcm3: true,
                    material: true,
                    price: true,
                    initialWeightG: true,
                },
            }),
        ]);
        const { currency, filamentPricePerKg } = this.settings.get();
        const printerNames = new Map(printerRows.map((p) => [p.id, p.name]));
        const spools = new Map<string, Spool>(spoolRows.map((s) => [s.id, s]));
        const finished = jobs.filter((j) => j.status !== 'printing');
        const completed = finished.filter((j) => j.status === 'completed');
        const cancelled = finished.filter((j) => j.status === 'cancelled');
        const errored = finished.filter((j) => j.status === 'error');
        const inProgress = jobs.length - finished.length;
        const totalDuration = sum(finished, (j) => j.durationSec ?? 0);
        const completedDuration = sum(completed, (j) => j.durationSec ?? 0);
        const totalFilament = sum(finished, (j) => j.filamentMm);
        const estimated = completed.filter((j) => j.estimatedSec > 0 && (j.durationSec ?? 0) > 0);
        const estimatedSec = sum(estimated, (j) => j.estimatedSec);
        const estimatedActualSec = sum(estimated, (j) => j.durationSec ?? 0);

        const daily = new Map<string, StatsBucket>();
        if (since && days <= DAILY_MAX_DAYS) {
            for (let i = 0; i < days; i++) {
                const key = dayKey(new Date(since.getTime() + i * 86_400_000));
                daily.set(key, emptyBucket(key));
            }
        }
        const months = new Map<string, StatsBucket>();
        const weekdays = new Map<string, StatsBucket>();
        for (let i = 0; i < 7; i++) weekdays.set(String(i), emptyBucket(String(i)));
        const hours = new Map<string, StatsBucket>();
        for (let i = 0; i < 24; i++) hours.set(String(i), emptyBucket(String(i)));
        const printers = new Map<string, StatsPrinterEntry>();
        const files = new Map<string, StatsFileEntry>();
        const materials = new Map<string, { filamentMm: number; weightG: number; cost: number; jobs: number }>();
        let totalFilamentG = 0;
        let totalCost = 0;
        let unpricedG = 0;

        for (const j of finished) {
            const d = j.startedAt;
            const ok = j.status === 'completed';
            const dur = j.durationSec ?? 0;
            const usage = parseUsage(j.spoolUsage);
            const entries = usage.length
                ? usage
                : j.filamentMm > 0
                  ? [{ slotIndex: 0, mm: j.filamentMm, material: '', spoolId: null }]
                  : [];
            const priced = entries.map((u) => {
                const spool = u.spoolId ? spools.get(u.spoolId) : undefined;
                const mat = (u.material || spool?.material || 'PLA').toUpperCase();
                const weightG = filamentWeightG(
                    u.mm,
                    spool?.diameterMm ?? 1.75,
                    spool?.densityGcm3 ?? DEFAULT_DENSITY[mat.split('-')[0]] ?? 1.24,
                );
                const perG =
                    spool && spool.price > 0 && spool.initialWeightG > 0
                        ? spool.price / spool.initialWeightG
                        : filamentPricePerKg > 0
                          ? filamentPricePerKg / 1000
                          : null;
                return { mm: u.mm, mat, weightG, cost: perG === null ? null : weightG * perG };
            });
            const jobCost = sum(priced, (u) => u.cost ?? 0);
            const dk = dayKey(d);
            const db = daily.get(dk);
            if (db) bump(db, ok, dur, j.filamentMm, jobCost);
            const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const mb = months.get(mk) ?? emptyBucket(mk);
            bump(mb, ok, dur, j.filamentMm, jobCost);
            months.set(mk, mb);
            const wd = weekdays.get(String(d.getDay()));
            if (wd) bump(wd, ok, dur, j.filamentMm, jobCost);
            const hb = hours.get(String(d.getHours()));
            if (hb) bump(hb, ok, dur, j.filamentMm, jobCost);

            const pe = printers.get(j.printerId) ?? {
                printerId: j.printerId,
                name: printerNames.get(j.printerId) ?? j.printerId,
                jobs: 0,
                completed: 0,
                durationSec: 0,
                filamentMm: 0,
                weightG: 0,
                cost: 0,
            };
            pe.jobs += 1;
            if (ok) pe.completed += 1;
            pe.durationSec += dur;
            pe.filamentMm += j.filamentMm;
            pe.cost += jobCost;
            printers.set(j.printerId, pe);

            const fk = j.fileId ?? j.filename;
            const fe = files.get(fk) ?? {
                filename: j.filename,
                fileId: j.fileId,
                thumbnail: j.file?.thumbnail ?? null,
                jobs: 0,
                completed: 0,
                durationSec: 0,
                filamentMm: 0,
                cost: 0,
                lastPrintedAt: d.toISOString(),
            };
            fe.jobs += 1;
            if (ok) fe.completed += 1;
            fe.durationSec += dur;
            fe.filamentMm += j.filamentMm;
            fe.cost += jobCost;
            fe.lastPrintedAt = d.toISOString();
            files.set(fk, fe);

            const seen = new Set<string>();
            for (const u of priced) {
                const me = materials.get(u.mat) ?? { filamentMm: 0, weightG: 0, cost: 0, jobs: 0 };
                me.filamentMm += u.mm;
                me.weightG += u.weightG;
                me.cost += u.cost ?? 0;
                if (!seen.has(u.mat)) {
                    me.jobs += 1;
                    seen.add(u.mat);
                }
                materials.set(u.mat, me);
                pe.weightG += u.weightG;
                totalFilamentG += u.weightG;
                if (u.cost === null) unpricedG += u.weightG;
                else totalCost += u.cost;
            }
        }

        const first = finished[0]?.startedAt ?? null;
        const last = finished[finished.length - 1]?.startedAt ?? null;
        return {
            totalJobs: finished.length,
            completed: completed.length,
            cancelled: cancelled.length,
            errored: errored.length,
            inProgress,
            successRate: finished.length ? completed.length / finished.length : 0,
            totalDurationSec: totalDuration,
            completedDurationSec: completedDuration,
            avgDurationSec: completed.length ? Math.round(completedDuration / completed.length) : 0,
            longestDurationSec: completed.length ? Math.max(...completed.map((j) => j.durationSec ?? 0)) : 0,
            estimatedDurationSec: estimatedSec,
            estimateRatio: estimatedSec > 0 ? estimatedActualSec / estimatedSec : null,
            totalFilamentMm: Math.round(totalFilament),
            totalFilamentG: Math.round(totalFilamentG),
            totalCost: money(totalCost),
            unpricedG: Math.round(unpricedG),
            currency,
            firstJobAt: first?.toISOString() ?? null,
            lastJobAt: last?.toISOString() ?? null,
            daily: [...daily.values()].map(roundBucket),
            months: [...months.values()]
                .sort((a, b) => a.key.localeCompare(b.key))
                .slice(-12)
                .map(roundBucket),
            weekdays: [...weekdays.values()].map(roundBucket),
            hours: [...hours.values()].map(roundBucket),
            printers: [...printers.values()]
                .map((p) => ({
                    ...p,
                    filamentMm: Math.round(p.filamentMm),
                    weightG: Math.round(p.weightG),
                    cost: money(p.cost),
                }))
                .sort((a, b) => b.durationSec - a.durationSec),
            topFiles: [...files.values()]
                .map((f) => ({ ...f, filamentMm: Math.round(f.filamentMm), cost: money(f.cost) }))
                .sort((a, b) => b.jobs - a.jobs || b.durationSec - a.durationSec)
                .slice(0, 8),
            materials: [...materials.entries()]
                .map(([material, v]) => ({
                    material,
                    filamentMm: Math.round(v.filamentMm),
                    weightG: Math.round(v.weightG),
                    cost: money(v.cost),
                    jobs: v.jobs,
                }))
                .sort((a, b) => b.filamentMm - a.filamentMm),
        };
    }
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
    return rows.reduce((acc, row) => acc + pick(row), 0);
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyBucket(key: string): StatsBucket {
    return { key, jobs: 0, completed: 0, durationSec: 0, filamentMm: 0, cost: 0 };
}

function roundBucket(b: StatsBucket): StatsBucket {
    return { ...b, cost: money(b.cost) };
}

function money(v: number): number {
    return Math.round(v * 100) / 100;
}

function bump(b: StatsBucket, ok: boolean, durationSec: number, filamentMm: number, cost: number): void {
    b.jobs += 1;
    if (ok) b.completed += 1;
    b.durationSec += durationSec;
    b.filamentMm += filamentMm;
    b.cost += cost;
}

function parseUsage(raw: string): SpoolUsageEntry[] {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}
