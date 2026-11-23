import type { PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';

export const HOME_STATUSES = ['printing', 'paused', 'bed_clear', 'ready', 'error', 'maintenance', 'offline'] as const;
export type HomeStatus = (typeof HOME_STATUSES)[number];

export const HOME_STATUS_LABEL: Record<HomeStatus, () => string> = {
    printing: m.home_count_printing,
    paused: m.home_count_paused,
    bed_clear: m.home_count_bed_clear,
    ready: m.home_count_ready,
    error: m.home_count_error,
    maintenance: m.home_count_maintenance,
    offline: m.home_count_offline,
};

export function homeStatus(
    p: Pick<PrinterWithLive, 'live'> & Partial<Pick<PrinterWithLive, 'maintenance' | 'awaitingBedClear'>>,
): HomeStatus {
    const live = p.live;
    if (!live?.connected) return 'offline';
    if (live.printState === 'printing') return 'printing';
    if (live.printState === 'paused') return 'paused';
    if (live.printState === 'error') return 'error';
    if (p.maintenance) return 'maintenance';
    if (p.awaitingBedClear) return 'bed_clear';
    return 'ready';
}

export function countByStatus(printers: Parameters<typeof homeStatus>[0][]): Record<HomeStatus, number> {
    const counts = Object.fromEntries(HOME_STATUSES.map((s) => [s, 0])) as Record<HomeStatus, number>;
    for (const p of printers) counts[homeStatus(p)] += 1;
    return counts;
}

export function nextToFinish(
    printers: Pick<PrinterWithLive, 'name' | 'live'>[],
    now = Date.now(),
): { name: string; at: number } | null {
    let best: { name: string; at: number } | null = null;
    for (const p of printers) {
        if (homeStatus(p) !== 'printing') continue;
        const remain = p.live?.remainTimeSec ?? 0;
        if (remain <= 0) continue;
        const at = now + remain * 1000;
        if (!best || at < best.at) best = { name: p.name, at };
    }
    return best;
}
