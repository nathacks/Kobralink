import type { PrintJob } from '../generated/prisma/client';

type MetricJob = Pick<
    PrintJob,
    'status' | 'failureReason' | 'durationSec' | 'estimatedSec' | 'startedAt' | 'finishedAt'
>;

export function isFailure(job: Pick<PrintJob, 'status' | 'failureReason'>): boolean {
    return job.status === 'error' || (job.status === 'cancelled' && job.failureReason !== 'user_cancel');
}

export function utilization(durationSec: number, windowSec: number, printers = 1): number | null {
    if (windowSec <= 0 || printers <= 0) return null;
    return Math.min(1, durationSec / (windowSec * printers));
}

export function mtbfSec(jobs: MetricJob[]): number | null {
    const finished = jobs.filter((j) => j.status !== 'printing');
    const failures = finished.filter(isFailure).length;
    if (!failures) return null;
    return Math.round(finished.reduce((a, j) => a + (j.durationSec ?? 0), 0) / failures);
}

export function idleAfterSec(jobs: MetricJob[]): number | null {
    const sorted = [...jobs].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const end = sorted[i - 1].finishedAt;
        if (!end) continue;
        const gap = (sorted[i].startedAt.getTime() - end.getTime()) / 1000;
        if (gap >= 0) gaps.push(gap);
    }
    if (!gaps.length) return null;
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2);
}

export function estimateRatio(jobs: MetricJob[]): number | null {
    const known = jobs.filter((j) => j.status === 'completed' && j.estimatedSec > 0 && (j.durationSec ?? 0) > 0);
    const estimated = known.reduce((a, j) => a + j.estimatedSec, 0);
    if (!estimated) return null;
    return known.reduce((a, j) => a + (j.durationSec ?? 0), 0) / estimated;
}
