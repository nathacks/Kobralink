import type { StatsBucket, StatsDto, StatsPrinterEntry } from '@farolprint/shared';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { formatDuration, formatMoney, formatShortDate } from '@/lib/format';
import { intlLocale, m } from '@/lib/i18n';
import { failureReasonLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { WasteCard } from './waste-card';

export function StatsBody({ data, days }: { data: StatsDto; days: number }) {
    const locale = intlLocale();
    const money = (v: number) => formatMoney(v, data.currency);
    const costSuffix = (v: number) => (v > 0 ? ` · ${money(v)}` : '');
    const hasCost = data.totalCost > 0;
    const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' });
    const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const useDaily = data.daily.length > 0;
    const series = useDaily
        ? data.daily.map((b) => {
              const [y, mo, d] = b.key.split('-').map(Number);
              return { ...b, label: dayFmt.format(new Date(y, mo - 1, d)), ...derive(b) };
          })
        : data.months.map((b) => {
              const [y, mo] = b.key.split('-').map(Number);
              return { ...b, label: monthFmt.format(new Date(y, mo - 1, 1)), ...derive(b) };
          });
    const weekdays = [...data.weekdays.slice(1), data.weekdays[0]].map((b) => ({
        ...b,
        label: weekdayFmt.format(new Date(2024, 0, 1 + ((Number(b.key) + 6) % 7))),
        ...derive(b),
    }));
    const hours = data.hours.map((b) => ({ ...b, label: `${b.key}h`, ...derive(b) }));
    const jobsConfig = {
        completed: { label: m.stats_completed(), color: 'var(--chart-1)' },
        failed: { label: m.stats_failed(), color: 'var(--chart-5)' },
    } satisfies ChartConfig;
    const hoursConfig = { hours: { label: m.stats_hours(), color: 'var(--chart-3)' } } satisfies ChartConfig;
    const costConfig = { cost: { label: m.stats_cost(), color: 'var(--chart-4)' } } satisfies ChartConfig;
    const materialConfig = {
        weightG: { label: m.stats_material_weight(), color: 'var(--chart-2)' },
    } satisfies ChartConfig;
    const tickInterval = useDaily ? Math.max(0, Math.ceil(series.length / 10) - 1) : 0;
    const prev = data.previous;
    const vs = days > 0 ? m.stats_vs_previous({ n: days }) : '';
    const period =
        data.firstJobAt && data.lastJobAt
            ? m.stats_period({ from: formatShortDate(data.firstJobAt), to: formatShortDate(data.lastJobAt) })
            : '';

    return (
        <>
            <div className={cn('grid gap-4 md:grid-cols-2', hasCost ? 'xl:grid-cols-5' : 'xl:grid-cols-4')}>
                <Tile
                    label={m.stats_total_jobs()}
                    value={String(data.totalJobs)}
                    sub={m.stats_success_rate({
                        pct: Math.round(data.successRate * 100),
                        failed: data.cancelled + data.errored,
                    })}
                    subDelta={
                        prev && prev.totalJobs > 0 && data.totalJobs > 0 ? (
                            <Delta value={pointChange(data.successRate, prev.successRate)} points title={vs} />
                        ) : null
                    }
                    extra={data.inProgress ? m.stats_in_progress({ n: data.inProgress }) : period}
                    delta={prev ? <Delta value={pctChange(data.totalJobs, prev.totalJobs)} title={vs} /> : null}
                />
                <Tile
                    label={m.stats_total_time()}
                    value={formatDuration(data.totalDurationSec, { units: 2 })}
                    sub={m.stats_avg({ duration: formatDuration(data.avgDurationSec) })}
                    extra={
                        data.estimateRatio !== null
                            ? m.stats_estimate({ pct: Math.round((1 / data.estimateRatio) * 100) })
                            : m.stats_estimate_none()
                    }
                    delta={
                        prev ? (
                            <Delta value={pctChange(data.totalDurationSec, prev.totalDurationSec)} title={vs} />
                        ) : null
                    }
                />
                <Tile
                    label={m.stats_utilization()}
                    value={data.utilization === null ? m.stats_unknown() : `${Math.round(data.utilization * 100)} %`}
                    sub={m.stats_utilization_sub({ n: Math.max(1, data.printers.length) })}
                    extra={m.stats_longest_extra({ duration: formatDuration(data.longestDurationSec) })}
                    delta={
                        prev && data.utilization !== null && prev.utilization !== null ? (
                            <Delta value={pointChange(data.utilization, prev.utilization)} points title={vs} />
                        ) : null
                    }
                />
                <Tile
                    label={m.stats_filament()}
                    value={`${(data.totalFilamentMm / 1000).toFixed(1)} m`}
                    sub={m.stats_filament_g({ g: data.totalFilamentG })}
                    extra={data.materials.map((x) => x.material).join(' · ')}
                    delta={
                        prev ? <Delta value={pctChange(data.totalFilamentG, prev.totalFilamentG)} title={vs} /> : null
                    }
                />
                {hasCost ? (
                    <Tile
                        label={m.stats_cost()}
                        value={money(data.totalCost)}
                        sub={m.stats_cost_avg({ value: money(data.totalCost / Math.max(1, data.totalJobs)) })}
                        extra={
                            data.energyCost > 0
                                ? m.stats_cost_breakdown({
                                      filament: money(data.filamentCost),
                                      energy: money(data.energyCost),
                                  })
                                : data.unpricedG > 0
                                  ? m.stats_cost_unpriced({ g: data.unpricedG })
                                  : m.stats_cost_all_priced()
                        }
                        delta={prev ? <Delta value={pctChange(data.totalCost, prev.totalCost)} title={vs} /> : null}
                    />
                ) : null}
            </div>
            <WasteCard waste={data.waste} totalFilamentG={data.totalFilamentG} currency={data.currency} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">
                            {useDaily ? m.stats_jobs_per_day() : m.stats_jobs_per_month()}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.totalJobs ? (
                            <ChartContainer config={jobsConfig} className="h-64 w-full">
                                <BarChart data={series} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={tickInterval} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Bar
                                        dataKey="completed"
                                        stackId="a"
                                        fill="var(--color-completed)"
                                        radius={[0, 0, 4, 4]}
                                    />
                                    <Bar
                                        dataKey="failed"
                                        stackId="a"
                                        fill="var(--color-failed)"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <Empty />
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">
                            {useDaily ? m.stats_hours_per_day() : m.stats_hours_per_month()}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.totalJobs ? (
                            <ChartContainer config={hoursConfig} className="h-64 w-full">
                                <BarChart data={series} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={tickInterval} />
                                    <YAxis tickLine={false} axisLine={false} width={32} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="hours" fill="var(--color-hours)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <Empty />
                        )}
                    </CardContent>
                </Card>

                {hasCost ? (
                    <Card className="rounded-3xl border-0 shadow-none md:col-span-2 xl:col-span-4">
                        <CardHeader>
                            <CardTitle className="text-lg font-medium">
                                {useDaily ? m.stats_cost_per_day() : m.stats_cost_per_month()}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={costConfig} className="h-56 w-full">
                                <BarChart data={series} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={tickInterval} />
                                    <YAxis tickLine={false} axisLine={false} width={40} />
                                    <ChartTooltip
                                        content={<ChartTooltipContent formatter={(v) => money(Number(v))} />}
                                    />
                                    <Bar dataKey="cost" fill="var(--color-cost)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                ) : null}

                <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">{m.stats_weekdays()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={jobsConfig} className="h-56 w-full">
                            <BarChart data={weekdays} margin={{ left: 0, right: 8 }}>
                                <CartesianGrid vertical={false} strokeOpacity={0.3} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar
                                    dataKey="completed"
                                    stackId="a"
                                    fill="var(--color-completed)"
                                    radius={[0, 0, 4, 4]}
                                />
                                <Bar dataKey="failed" stackId="a" fill="var(--color-failed)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">{m.stats_hours_of_day()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={jobsConfig} className="h-56 w-full">
                            <BarChart data={hours} margin={{ left: 0, right: 8 }}>
                                <CartesianGrid vertical={false} strokeOpacity={0.3} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar
                                    dataKey="completed"
                                    stackId="a"
                                    fill="var(--color-completed)"
                                    radius={[0, 0, 4, 4]}
                                />
                                <Bar dataKey="failed" stackId="a" fill="var(--color-failed)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {data.printers.length ? (
                    <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg font-medium">{m.stats_printers()}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                {data.printers.map((p) => (
                                    <PrinterRow key={p.printerId} printer={p} costSuffix={costSuffix} />
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ) : null}

                <Card
                    className={cn(
                        'rounded-3xl border-0 shadow-none md:col-span-2',
                        data.printers.length ? '' : 'xl:col-span-4',
                    )}
                >
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">{m.stats_materials()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.materials.length ? (
                            <div className={cn('grid gap-4', data.printers.length ? '' : 'xl:grid-cols-2')}>
                                <ChartContainer config={materialConfig} className="h-56 w-full">
                                    <BarChart data={data.materials} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid horizontal={false} strokeOpacity={0.3} />
                                        <XAxis type="number" tickLine={false} axisLine={false} unit=" g" />
                                        <YAxis
                                            type="category"
                                            dataKey="material"
                                            tickLine={false}
                                            axisLine={false}
                                            width={64}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="weightG" fill="var(--color-weightG)" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ChartContainer>
                                <ul className="grid content-start gap-2">
                                    {data.materials.map((x) => (
                                        <li
                                            key={x.material}
                                            className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-3 py-2"
                                        >
                                            <span className="text-sm font-medium">{x.material}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {m.stats_material_meta({
                                                    jobs: x.jobs,
                                                    m: (x.filamentMm / 1000).toFixed(1),
                                                    g: x.weightG,
                                                    cost: costSuffix(x.cost),
                                                })}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <Empty />
                        )}
                    </CardContent>
                </Card>

                {data.failures.length ? (
                    <Card className="rounded-3xl border-0 shadow-none md:col-span-2 xl:col-span-4">
                        <CardHeader>
                            <CardTitle className="text-lg font-medium">{m.stats_failures()}</CardTitle>
                            <p className="text-sm text-muted-foreground">{m.stats_failures_hint()}</p>
                        </CardHeader>
                        <CardContent>
                            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                                {pareto(data.failures).map((f) => {
                                    const { pct, cumulative } = f;
                                    return (
                                        <li key={f.reason} className="rounded-2xl bg-secondary/60 p-3">
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="font-medium">{failureReasonLabel(f.reason)}</span>
                                                <span className="tabular-nums text-muted-foreground">
                                                    {f.count} · {pct}%
                                                </span>
                                            </div>
                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
                                                <div
                                                    className="h-full rounded-full bg-chart-5"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {m.stats_pareto_cumulative({ pct: cumulative })}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CardContent>
                    </Card>
                ) : null}

                <Card className="rounded-3xl border-0 shadow-none md:col-span-2 xl:col-span-4">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">{m.stats_top_files()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.topFiles.length ? (
                            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                                {data.topFiles.map((f) => (
                                    <li
                                        key={f.fileId ?? f.filename}
                                        className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3"
                                    >
                                        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">
                                            {f.thumbnail ? (
                                                <img
                                                    src={`data:image/png;base64,${f.thumbnail}`}
                                                    alt=""
                                                    className="size-full object-contain"
                                                />
                                            ) : (
                                                <span className="text-xs text-muted-foreground">gcode</span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium" title={f.filename}>
                                                {f.filename}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {m.stats_file_meta({
                                                    jobs: f.jobs,
                                                    completed: f.completed,
                                                    duration: formatDuration(f.durationSec),
                                                    m: (f.filamentMm / 1000).toFixed(1),
                                                })}
                                                {costSuffix(f.cost)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {m.stats_file_last({ date: formatShortDate(f.lastPrintedAt) })}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <Empty />
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

export function pctChange(current: number, previous: number): number | null {
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 100);
}

export function pointChange(current: number, previous: number): number {
    return Math.round((current - previous) * 100);
}

export function pareto(
    failures: StatsDto['failures'],
): { reason: string; count: number; pct: number; cumulative: number }[] {
    const total = failures.reduce((a, f) => a + f.count, 0);
    let running = 0;
    return [...failures]
        .sort((a, b) => b.count - a.count)
        .map((f) => {
            running += f.count;
            return {
                ...f,
                pct: total ? Math.round((f.count / total) * 100) : 0,
                cumulative: total ? Math.round((running / total) * 100) : 0,
            };
        });
}

function Delta({ value, points = false, title }: { value: number | null; points?: boolean; title: string }) {
    if (value === null) return null;
    const text = `${value > 0 ? '+' : ''}${value}`;
    return (
        <span
            title={title}
            className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                value === 0 ? 'bg-secondary text-muted-foreground' : 'bg-primary/15 text-primary-strong',
            )}
        >
            {points ? m.stats_delta_points({ n: text }) : `${text} %`}
        </span>
    );
}

function PrinterRow({ printer: p, costSuffix }: { printer: StatsPrinterEntry; costSuffix: (v: number) => string }) {
    const util = p.utilization === null ? null : Math.round(p.utilization * 100);
    const metrics = [
        [m.stats_mtbf(), p.mtbfSec === null ? m.stats_mtbf_none() : formatDuration(p.mtbfSec)],
        [m.stats_idle_after(), p.idleAfterSec === null ? m.stats_unknown() : formatDuration(p.idleAfterSec)],
        [
            m.stats_estimate_accuracy(),
            p.estimateRatio === null
                ? m.stats_unknown()
                : m.stats_estimate_accuracy_value({ pct: Math.round((1 / p.estimateRatio) * 100) }),
        ],
        ...(p.energyKwh === null ? [] : [[m.stats_energy_measured(), m.energy_kwh({ kwh: p.energyKwh.toFixed(2) })]]),
    ];
    return (
        <li className="rounded-2xl bg-secondary/60 p-3">
            <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {util === null ? m.stats_unknown() : m.stats_printer_utilization({ pct: util })}
                </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: `${util ?? 0}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
                {m.stats_printer_meta({
                    jobs: p.jobs,
                    completed: p.completed,
                    duration: formatDuration(p.durationSec),
                    g: p.weightG,
                    cost: costSuffix(p.cost),
                })}
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                {metrics.map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-background/60 px-2 py-1.5">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                ))}
            </dl>
        </li>
    );
}

function derive(b: StatsBucket): { hours: number; failed: number } {
    return { hours: Math.round(b.durationSec / 360) / 10, failed: b.jobs - b.completed };
}

function Tile({
    label,
    value,
    sub,
    extra,
    delta,
    subDelta,
}: {
    label: string;
    value: string;
    sub: string;
    extra?: string;
    delta?: React.ReactNode;
    subDelta?: React.ReactNode;
}) {
    return (
        <Card className="gap-2 rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
                <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">{value}</span>
                    {delta}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{sub}</span>
                    {subDelta}
                </div>
                {extra ? <div className="truncate text-xs text-muted-foreground/70">{extra}</div> : null}
            </CardContent>
        </Card>
    );
}

function Empty() {
    return <p className="py-10 text-center text-sm text-muted-foreground">{m.stats_empty()}</p>;
}
