import {
    DEFAULT_DENSITY,
    filamentWeightG,
    type SpoolUsageEntry,
    type StatsBucket,
    type StatsDto,
} from '@kobralink/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatsService {
    constructor(private readonly prisma: PrismaService) {}

    async compute(printerId?: string, days = 0): Promise<StatsDto> {
        const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;
        const jobs = await this.prisma.client.printJob.findMany({
            where: { ...(printerId ? { printerId } : {}), ...(since ? { startedAt: { gte: since } } : {}) },
            include: { file: { select: { thumbnail: true, id: true } } },
            orderBy: { startedAt: 'asc' },
        });
        const finished = jobs.filter((j) => j.status !== 'printing');
        const completed = finished.filter((j) => j.status === 'completed');
        const cancelled = finished.filter((j) => j.status === 'cancelled');
        const errored = finished.filter((j) => j.status === 'error');
        const durations = finished.map((j) => j.durationSec ?? 0);
        const totalDuration = durations.reduce((a, b) => a + b, 0);
        const totalFilament = finished.reduce((a, j) => a + j.filamentMm, 0);

        const months = new Map<string, StatsBucket>();
        const weekdays = new Map<string, StatsBucket>();
        for (let i = 0; i < 7; i++)
            weekdays.set(String(i), { key: String(i), jobs: 0, completed: 0, durationSec: 0, filamentMm: 0 });
        const files = new Map<
            string,
            {
                filename: string;
                fileId: string | null;
                thumbnail: string | null;
                jobs: number;
                completed: number;
                durationSec: number;
            }
        >();
        const materials = new Map<string, { filamentMm: number; jobs: number }>();
        let totalFilamentG = 0;

        for (const j of finished) {
            const d = j.startedAt;
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const bucket = months.get(monthKey) ?? {
                key: monthKey,
                jobs: 0,
                completed: 0,
                durationSec: 0,
                filamentMm: 0,
            };
            bump(bucket, j.status === 'completed', j.durationSec ?? 0, j.filamentMm);
            months.set(monthKey, bucket);
            const wd = weekdays.get(String(d.getDay()));
            if (wd) bump(wd, j.status === 'completed', j.durationSec ?? 0, j.filamentMm);

            const fk = j.fileId ?? j.filename;
            const fe = files.get(fk) ?? {
                filename: j.filename,
                fileId: j.fileId,
                thumbnail: j.file?.thumbnail ?? null,
                jobs: 0,
                completed: 0,
                durationSec: 0,
            };
            fe.jobs += 1;
            if (j.status === 'completed') fe.completed += 1;
            fe.durationSec += j.durationSec ?? 0;
            files.set(fk, fe);

            const usage = parseUsage(j.spoolUsage);
            const entries = usage.length
                ? usage
                : j.filamentMm > 0
                  ? [{ slotIndex: 0, mm: j.filamentMm, material: '', spoolId: null }]
                  : [];
            const seen = new Set<string>();
            for (const u of entries) {
                const mat = (u.material || 'PLA').toUpperCase();
                const me = materials.get(mat) ?? { filamentMm: 0, jobs: 0 };
                me.filamentMm += u.mm;
                if (!seen.has(mat)) {
                    me.jobs += 1;
                    seen.add(mat);
                }
                materials.set(mat, me);
                totalFilamentG += filamentWeightG(u.mm, 1.75, DEFAULT_DENSITY[mat.split('-')[0]] ?? 1.24);
            }
        }

        const monthList = [...months.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
        return {
            totalJobs: finished.length,
            completed: completed.length,
            cancelled: cancelled.length,
            errored: errored.length,
            successRate: finished.length ? completed.length / finished.length : 0,
            totalDurationSec: totalDuration,
            avgDurationSec: finished.length ? Math.round(totalDuration / finished.length) : 0,
            longestDurationSec: durations.length ? Math.max(...durations) : 0,
            totalFilamentMm: Math.round(totalFilament),
            totalFilamentG: Math.round(totalFilamentG),
            months: monthList,
            weekdays: [...weekdays.values()],
            topFiles: [...files.values()].sort((a, b) => b.jobs - a.jobs || b.durationSec - a.durationSec).slice(0, 8),
            materials: [...materials.entries()]
                .map(([material, v]) => ({
                    material,
                    filamentMm: Math.round(v.filamentMm),
                    weightG: Math.round(
                        filamentWeightG(v.filamentMm, 1.75, DEFAULT_DENSITY[material.split('-')[0]] ?? 1.24),
                    ),
                    jobs: v.jobs,
                }))
                .sort((a, b) => b.filamentMm - a.filamentMm),
        };
    }
}

function bump(b: StatsBucket, ok: boolean, durationSec: number, filamentMm: number): void {
    b.jobs += 1;
    if (ok) b.completed += 1;
    b.durationSec += durationSec;
    b.filamentMm += filamentMm;
}

function parseUsage(raw: string): SpoolUsageEntry[] {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}
