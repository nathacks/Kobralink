import type { StatsBucket, StatsDto, StatsPrinterEntry } from '@farolprint/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatDuration, formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { pareto, pctChange, pointChange, StatsBody } from './stats-body';

vi.mock('recharts', () => ({
    Bar: () => null,
    BarChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="chart">{children}</div>,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
}));

vi.mock('@/components/ui/chart', () => ({
    ChartContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    ChartLegend: () => null,
    ChartLegendContent: () => null,
    ChartTooltip: () => null,
    ChartTooltipContent: () => null,
}));

const bucket = (key: string, jobs = 0): StatsBucket => ({
    key,
    jobs,
    completed: jobs,
    durationSec: 0,
    filamentMm: 0,
    cost: 0,
});

const data: StatsDto = {
    totalJobs: 4,
    completed: 2,
    cancelled: 1,
    errored: 1,
    inProgress: 0,
    successRate: 0.5,
    totalDurationSec: 7200,
    completedDurationSec: 7200,
    avgDurationSec: 3600,
    longestDurationSec: 3600,
    estimatedDurationSec: 0,
    estimateRatio: null,
    totalFilamentMm: 12000,
    totalFilamentG: 36,
    totalCost: 1.65,
    filamentCost: 0,
    energyCost: 0.15,
    unpricedG: 0,
    currency: 'EUR',
    firstJobAt: '2026-10-01T00:00:00.000Z',
    lastJobAt: '2026-10-20T00:00:00.000Z',
    daily: [],
    months: [bucket('2026-10', 4)],
    weekdays: Array.from({ length: 7 }, (_, i) => bucket(String(i))),
    hours: Array.from({ length: 24 }, (_, i) => bucket(String(i))),
    printers: [],
    topFiles: [],
    materials: [{ material: 'PLA', filamentMm: 12000, weightG: 36, cost: 0, jobs: 4 }],
    failures: [
        { reason: 'spaghetti', count: 1 },
        { reason: 'error', count: 1 },
    ],
    waste: {
        paused: { jobs: 1, filamentMm: 3000, weightG: 9, filamentCost: 0 },
        cancelled: { jobs: 1, filamentMm: 1000, weightG: 3, filamentCost: 0 },
    },
    utilization: 0.25,
    previous: null,
    energyKwh: null,
};

const printer: StatsPrinterEntry = {
    printerId: 'p1',
    name: 'Kobra 4',
    jobs: 4,
    completed: 2,
    failed: 2,
    durationSec: 7200,
    filamentMm: 12000,
    weightG: 36,
    cost: 1.65,
    utilization: 0.25,
    mtbfSec: 3600,
    idleAfterSec: 900,
    estimateRatio: 1.25,
    energyKwh: null,
};

describe('StatsBody', () => {
    it('shows the cost tile with its breakdown and the failures by reason', async () => {
        await renderWithProviders(<StatsBody data={data} days={30} />);
        expect(screen.getByText(formatMoney(1.65, 'EUR'))).toBeTruthy();
        expect(
            screen.getByText(
                m.stats_cost_breakdown({
                    filament: formatMoney(0, 'EUR'),
                    energy: formatMoney(0.15, 'EUR'),
                }),
            ),
        ).toBeTruthy();
        expect(screen.getByText(m.stats_failures())).toBeTruthy();
        expect(screen.getByText(m.failure_reason_spaghetti())).toBeTruthy();
        expect(screen.getByText(m.failure_reason_error())).toBeTruthy();
        expect(screen.getAllByText('1 · 50%')).toHaveLength(2);
    });

    it('shows the wasted filament next to the key figures', async () => {
        await renderWithProviders(<StatsBody data={data} days={30} />);
        expect(screen.getByText(m.stats_waste_title())).toBeTruthy();
        expect(screen.getByText('12 g')).toBeTruthy();
        expect(screen.getByText(m.stats_waste_share({ pct: 33 }))).toBeTruthy();
    });

    it('hides the cost tile and the failures card when there is nothing to show', async () => {
        await renderWithProviders(
            <StatsBody data={{ ...data, totalCost: 0, energyCost: 0, failures: [] }} days={30} />,
        );
        expect(screen.queryByText(m.stats_failures())).toBeNull();
        expect(screen.queryByText(formatMoney(0, 'EUR'))).toBeNull();
    });

    it('tells when all filament is priced and when some is not', async () => {
        await renderWithProviders(
            <StatsBody data={{ ...data, totalCost: 2, energyCost: 0, filamentCost: 2 }} days={30} />,
        );
        expect(screen.getByText(m.stats_cost_all_priced())).toBeTruthy();
    });

    it('mentions unpriced filament', async () => {
        await renderWithProviders(
            <StatsBody data={{ ...data, totalCost: 2, energyCost: 0, filamentCost: 2, unpricedG: 12 }} days={30} />,
        );
        expect(screen.getByText(m.stats_cost_unpriced({ g: 12 }))).toBeTruthy();
    });
});

describe('StatsBody comparisons and printers', () => {
    const previous = {
        totalJobs: 2,
        successRate: 0.75,
        totalDurationSec: 3600,
        utilization: 0.1,
        totalFilamentG: 36,
        totalCost: 0,
    };

    it('compares the key figures with the previous period', async () => {
        await renderWithProviders(<StatsBody data={{ ...data, previous }} days={30} />);
        expect(screen.getByText('25 %')).toBeTruthy();
        expect(screen.getAllByText('+100 %')).toHaveLength(2);
        expect(screen.getByText('0 %')).toBeTruthy();
        expect(screen.getByText(m.stats_delta_points({ n: '-25' }))).toBeTruthy();
        expect(screen.getByText(m.stats_delta_points({ n: '+15' }))).toBeTruthy();
        expect(screen.getAllByTitle(m.stats_vs_previous({ n: 30 })).length).toBe(5);
    });

    it('shows no comparison without a previous period', async () => {
        await renderWithProviders(<StatsBody data={{ ...data, utilization: null }} days={0} />);
        expect(screen.queryByTitle(m.stats_vs_previous({ n: 0 }))).toBeNull();
        expect(screen.getByText(m.stats_utilization())).toBeTruthy();
    });

    it('lists each printer with its utilisation, failures, idle time and estimate accuracy', async () => {
        const idle: StatsPrinterEntry = {
            ...printer,
            printerId: 'p2',
            name: 'Kobra X',
            jobs: 0,
            utilization: null,
            mtbfSec: null,
            idleAfterSec: null,
            estimateRatio: null,
        };
        await renderWithProviders(<StatsBody data={{ ...data, printers: [printer, idle] }} days={30} />);
        expect(screen.getByText('Kobra 4')).toBeTruthy();
        expect(screen.getByText(m.stats_printer_utilization({ pct: 25 }))).toBeTruthy();
        expect(screen.getByText(formatDuration(3600))).toBeTruthy();
        expect(screen.getByText(formatDuration(900))).toBeTruthy();
        expect(screen.getByText(m.stats_estimate_accuracy_value({ pct: 80 }))).toBeTruthy();
        expect(screen.getByText(m.stats_mtbf_none())).toBeTruthy();
        expect(screen.getAllByText(m.stats_unknown()).length).toBeGreaterThanOrEqual(3);
    });

    it('shows the energy measured on a printer', async () => {
        await renderWithProviders(
            <StatsBody data={{ ...data, printers: [{ ...printer, energyKwh: 3.2 }] }} days={30} />,
        );
        expect(screen.getByText(m.stats_energy_measured())).toBeTruthy();
        expect(screen.getByText(m.energy_kwh({ kwh: '3.20' }))).toBeTruthy();
    });

    it('shows the cumulative share of each failure reason', async () => {
        await renderWithProviders(<StatsBody data={data} days={30} />);
        expect(screen.getByText(m.stats_failures_hint())).toBeTruthy();
        expect(screen.getByText(m.stats_pareto_cumulative({ pct: 50 }))).toBeTruthy();
        expect(screen.getByText(m.stats_pareto_cumulative({ pct: 100 }))).toBeTruthy();
    });
});

describe('stats helpers', () => {
    it('computes percent and point changes', () => {
        expect(pctChange(15, 10)).toBe(50);
        expect(pctChange(5, 0)).toBeNull();
        expect(pointChange(0.9, 0.75)).toBe(15);
    });

    it('sorts failures and accumulates their share', () => {
        expect(
            pareto([
                { reason: 'clog', count: 1 },
                { reason: 'spaghetti', count: 3 },
            ]),
        ).toEqual([
            { reason: 'spaghetti', count: 3, pct: 75, cumulative: 75 },
            { reason: 'clog', count: 1, pct: 25, cumulative: 100 },
        ]);
        expect(pareto([])).toEqual([]);
    });
});
