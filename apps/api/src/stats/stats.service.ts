import {
    type PrintJobDto,
    round2,
    type StatsBucket,
    type StatsDto,
    type StatsFileEntry,
    type StatsPrinterEntry,
    type StatsSummary,
    type StatsWaste,
    type StatsWasteEntry,
} from '@kobralink/shared';
import { Injectable } from '@nestjs/common';
import { toJobDto } from '../gcode/gcode.service';
import type { PrintJob } from '../generated/prisma/client';
import { PrintersService } from '../printers/printers.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { hasAnyPricing, type PricedSpool, type PricingContext, priceJob } from './job-cost';
import { jobsToCsv } from './stats-csv';
import { estimateRatio, idleAfterSec, mtbfSec, utilization } from './stats-metrics';

const DAILY_MAX_DAYS = 90;

type JobRow = PrintJob & { file: { thumbnail: string | null; id: string; filaments: string } | null };

@Injectable()
export class StatsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly settings: SettingsService,
    ) {}

    async pricing(): Promise<PricingContext> {
        const spoolRows = await this.prisma.client.localSpool.findMany({
            select: {
                id: true,
                diameterMm: true,
                densityGcm3: true,
                material: true,
            },
        });
        const printerRows = await this.prisma.client.printer.findMany({ select: { id: true, settings: true } });
        const { filamentPricePerKg, costs } = this.settings.get();
        return {
            spools: new Map<string, PricedSpool>(spoolRows.map((s) => [s.id, s])),
            filamentPricePerKg,
            costs,
            printers: new Map(
                printerRows.map((p) => {
                    const parsed = PrintersService.parseSettings(p.settings);
                    return [
                        p.id,
                        {
                            powerW: parsed.profile.powerW,
                            measuresEnergy: Boolean(parsed.energySensor),
                        },
                    ];
                }),
            ),
        };
    }

    async history(printerId: string | undefined, limit = 50, offset = 0): Promise<PrintJobDto[]> {
        const [rows, ctx] = await Promise.all([
            this.prisma.client.printJob.findMany({
                where: printerId ? { printerId } : undefined,
                orderBy: { startedAt: 'desc' },
                take: limit,
                skip: offset,
                include: { file: { select: { thumbnail: true, id: true, filaments: true } } },
            }),
            this.pricing(),
        ]);
        return rows.map((r) => this.withCost(r, ctx));
    }

    private withCost(r: JobRow, ctx: PricingContext): PrintJobDto {
        const dto = toJobDto(r, r.file?.thumbnail ?? null);
        if (r.status === 'printing' || !hasAnyPricing(ctx)) return dto;
        return { ...dto, cost: priceJob(r, ctx).cost };
    }

    async exportCsv(printerId?: string, days = 0): Promise<string> {
        const since = sinceDate(days);
        const [rows, ctx, printers] = await Promise.all([
            this.prisma.client.printJob.findMany({
                where: { ...(printerId ? { printerId } : {}), ...(since ? { startedAt: { gte: since } } : {}) },
                include: { file: { select: { thumbnail: true, id: true, filaments: true } } },
                orderBy: { startedAt: 'asc' },
            }),
            this.pricing(),
            this.prisma.client.printer.findMany({ select: { id: true, name: true } }),
        ]);
        const names = new Map(printers.map((p) => [p.id, p.name]));
        return jobsToCsv(
            rows.map((r) => this.withCost(r, ctx)),
            names,
            this.settings.get().currency,
        );
    }

    async compute(printerId?: string, days = 0): Promise<StatsDto> {
        const now = new Date();
        const since = sinceDate(days);
        const previousSince = since ? new Date(since.getTime() - days * 86_400_000) : undefined;
        const [jobs, printerRows, ctx, previousJobs] = await Promise.all([
            this.prisma.client.printJob.findMany({
                where: { ...(printerId ? { printerId } : {}), ...(since ? { startedAt: { gte: since } } : {}) },
                include: { file: { select: { thumbnail: true, id: true, filaments: true } } },
                orderBy: { startedAt: 'asc' },
            }),
            this.prisma.client.printer.findMany({ select: { id: true, name: true } }),
            this.pricing(),
            previousSince && since
                ? this.prisma.client.printJob.findMany({
                      where: {
                          ...(printerId ? { printerId } : {}),
                          startedAt: { gte: previousSince, lt: since },
                          status: { not: 'printing' },
                      },
                      include: { file: { select: { thumbnail: true, id: true, filaments: true } } },
                  })
                : Promise.resolve(null),
        ]);
        const { currency } = this.settings.get();
        const printerNames = new Map(printerRows.map((p) => [p.id, p.name]));
        const finished = jobs.filter((j) => j.status !== 'printing');
        const completed = finished.filter((j) => j.status === 'completed');
        const cancelled = finished.filter((j) => j.status === 'cancelled');
        const errored = finished.filter((j) => j.status === 'error');
        const inProgress = jobs.length - finished.length;
        const totalDuration = sum(finished, (j) => j.durationSec ?? 0);
        const completedDuration = sum(completed, (j) => j.durationSec ?? 0);
        const totalFilament = sum(finished, (j) => j.filamentMm);
        const estimatedSec = sum(
            completed.filter((j) => j.estimatedSec > 0 && (j.durationSec ?? 0) > 0),
            (j) => j.estimatedSec,
        );
        const fleetSize = printerId ? 1 : Math.max(1, printerRows.length);
        const windowStart = since ?? jobs[0]?.startedAt ?? null;
        const windowSec = windowStart ? Math.max(0, (now.getTime() - windowStart.getTime()) / 1000) : 0;

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
        const failures = new Map<string, number>();
        const waste: StatsWaste = { paused: emptyWaste(), cancelled: emptyWaste() };
        let totalFilamentG = 0;
        let filamentCost = 0;
        let energyCost = 0;
        let unpricedG = 0;
        let energyKwh: number | null = null;

        for (const j of finished) {
            const d = j.startedAt;
            const ok = j.status === 'completed';
            const dur = j.durationSec ?? 0;
            const priced = priceJob(j, ctx);
            const jobCost = priced.cost.total;
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
            if (!ok) {
                const reason = j.failureReason || (j.status === 'error' ? 'error' : 'unlabeled');
                failures.set(reason, (failures.get(reason) ?? 0) + 1);
                const we = j.pausedAt ? waste.paused : waste.cancelled;
                we.jobs += 1;
                we.filamentMm += j.filamentMm;
                we.weightG += priced.weightG;
                we.filamentCost += priced.filamentCost;
            }

            const pe = printers.get(j.printerId) ?? emptyPrinter(j.printerId, printerNames.get(j.printerId));
            pe.jobs += 1;
            if (ok) pe.completed += 1;
            else pe.failed += 1;
            pe.durationSec += dur;
            pe.filamentMm += j.filamentMm;
            pe.weightG += priced.weightG;
            pe.cost += jobCost;
            if (j.energyKwh !== null) {
                pe.energyKwh = (pe.energyKwh ?? 0) + j.energyKwh;
                energyKwh = (energyKwh ?? 0) + j.energyKwh;
            }
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
            for (const u of priced.usage) {
                const me = materials.get(u.material) ?? { filamentMm: 0, weightG: 0, cost: 0, jobs: 0 };
                me.filamentMm += u.mm;
                me.weightG += u.weightG;
                me.cost += u.cost ?? 0;
                if (!seen.has(u.material)) {
                    me.jobs += 1;
                    seen.add(u.material);
                }
                materials.set(u.material, me);
            }
            totalFilamentG += priced.weightG;
            unpricedG += priced.unpricedG;
            filamentCost += priced.cost.filament;
            energyCost += priced.cost.energy;
        }

        for (const p of printerRows) {
            if ((!printerId || p.id === printerId) && !printers.has(p.id))
                printers.set(p.id, emptyPrinter(p.id, p.name));
        }
        for (const pe of printers.values()) {
            const own = jobs.filter((j) => j.printerId === pe.printerId);
            pe.utilization = utilization(pe.durationSec, windowSec);
            pe.mtbfSec = mtbfSec(own);
            pe.idleAfterSec = idleAfterSec(own);
            pe.estimateRatio = estimateRatio(own);
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
            estimateRatio: estimateRatio(finished),
            totalFilamentMm: Math.round(totalFilament),
            totalFilamentG: Math.round(totalFilamentG),
            totalCost: round2(filamentCost + energyCost),
            filamentCost: round2(filamentCost),
            energyCost: round2(energyCost),
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
                    cost: round2(p.cost),
                    energyKwh: p.energyKwh === null ? null : round3(p.energyKwh),
                }))
                .sort((a, b) => b.durationSec - a.durationSec),
            topFiles: [...files.values()]
                .map((f) => ({ ...f, filamentMm: Math.round(f.filamentMm), cost: round2(f.cost) }))
                .sort((a, b) => b.jobs - a.jobs || b.durationSec - a.durationSec)
                .slice(0, 8),
            materials: [...materials.entries()]
                .map(([material, v]) => ({
                    material,
                    filamentMm: Math.round(v.filamentMm),
                    weightG: Math.round(v.weightG),
                    cost: round2(v.cost),
                    jobs: v.jobs,
                }))
                .sort((a, b) => b.filamentMm - a.filamentMm),
            failures: [...failures.entries()]
                .map(([reason, count]) => ({ reason, count }))
                .sort((a, b) => b.count - a.count),
            waste: { paused: roundWaste(waste.paused), cancelled: roundWaste(waste.cancelled) },
            utilization: utilization(totalDuration, windowSec, fleetSize),
            energyKwh: energyKwh === null ? null : round3(energyKwh),
            previous: previousJobs ? this.summarize(previousJobs, ctx, days * 86_400, fleetSize) : null,
        };
    }

    private summarize(jobs: JobRow[], ctx: PricingContext, windowSec: number, printers: number): StatsSummary {
        let weightG = 0;
        let cost = 0;
        for (const j of jobs) {
            const priced = priceJob(j, ctx);
            weightG += priced.weightG;
            cost += priced.cost.total;
        }
        const completed = jobs.filter((j) => j.status === 'completed').length;
        const durationSec = sum(jobs, (j) => j.durationSec ?? 0);
        return {
            totalJobs: jobs.length,
            successRate: jobs.length ? completed / jobs.length : 0,
            totalDurationSec: durationSec,
            utilization: utilization(durationSec, windowSec, printers),
            totalFilamentG: Math.round(weightG),
            totalCost: round2(cost),
        };
    }
}

function emptyPrinter(printerId: string, name?: string): StatsPrinterEntry {
    return {
        printerId,
        name: name ?? printerId,
        jobs: 0,
        completed: 0,
        failed: 0,
        durationSec: 0,
        filamentMm: 0,
        weightG: 0,
        cost: 0,
        utilization: null,
        mtbfSec: null,
        idleAfterSec: null,
        estimateRatio: null,
        energyKwh: null,
    };
}

function round3(v: number): number {
    return Math.round(v * 1000) / 1000;
}

function sinceDate(days: number): Date | undefined {
    return days > 0 ? startOfDay(new Date(Date.now() - (days - 1) * 86_400_000)) : undefined;
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

function emptyWaste(): StatsWasteEntry {
    return { jobs: 0, filamentMm: 0, weightG: 0, filamentCost: 0 };
}

function roundWaste(w: StatsWasteEntry): StatsWasteEntry {
    return {
        jobs: w.jobs,
        filamentMm: Math.round(w.filamentMm),
        weightG: Math.round(w.weightG),
        filamentCost: round2(w.filamentCost),
    };
}

function emptyBucket(key: string): StatsBucket {
    return { key, jobs: 0, completed: 0, durationSec: 0, filamentMm: 0, cost: 0 };
}

function roundBucket(b: StatsBucket): StatsBucket {
    return { ...b, cost: round2(b.cost) };
}

function bump(b: StatsBucket, ok: boolean, durationSec: number, filamentMm: number, cost: number): void {
    b.jobs += 1;
    if (ok) b.completed += 1;
    b.durationSec += durationSec;
    b.filamentMm += filamentMm;
    b.cost += cost;
}
