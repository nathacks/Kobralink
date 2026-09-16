import type { StatsBucket, StatsDto } from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrinters } from '@/hooks/use-printers';
import { formatDuration, formatMoney, formatShortDate } from '@/lib/format';
import { intlLocale, m } from '@/lib/i18n';
import { statsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
    printer: z.string().optional(),
    days: z.number().int().min(0).optional(),
});

export const Route = createFileRoute('/_app/stats')({
    validateSearch: searchSchema,
    component: StatsPage,
});

const RANGES = [7, 30, 90, 365, 0];

function StatsPage() {
    const { printer, days = 30 } = Route.useSearch();
    const navigate = Route.useNavigate();
    const printers = usePrinters();
    const stats = useQuery(statsQuery(printer, days));
    const set = (patch: { printer?: string; days?: number }) =>
        navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 px-2">
                <h2 className="text-xl font-medium">{m.stats_title()}</h2>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Select
                        value={printer ?? 'all'}
                        onValueChange={(v) => set({ printer: v === 'all' ? undefined : v })}
                    >
                        <SelectTrigger className="w-48 rounded-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{m.stats_all_printers()}</SelectItem>
                            {printers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="flex gap-1 rounded-full bg-secondary p-1">
                        {RANGES.map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => set({ days: r })}
                                className={cn(
                                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                    days === r
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {r === 0 ? m.stats_range_all() : m.stats_range_days({ n: r })}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {stats.data ? <StatsBody data={stats.data} days={days} /> : <Skeleton className="h-96 rounded-3xl" />}
        </div>
    );
}

function StatsBody({ data, days }: { data: StatsDto; days: number }) {
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
                    extra={data.inProgress ? m.stats_in_progress({ n: data.inProgress }) : period}
                />
                <Tile
                    label={m.stats_total_time()}
                    value={formatDuration(data.totalDurationSec)}
                    sub={m.stats_avg({ duration: formatDuration(data.avgDurationSec) })}
                    extra={
                        data.estimateRatio !== null
                            ? m.stats_estimate({ pct: Math.round((1 / data.estimateRatio) * 100) })
                            : m.stats_estimate_none()
                    }
                />
                <Tile
                    label={m.stats_longest()}
                    value={formatDuration(data.longestDurationSec)}
                    sub={`${m.stats_completed()} : ${data.completed}`}
                    extra={days === 0 ? period : ''}
                />
                <Tile
                    label={m.stats_filament()}
                    value={`${(data.totalFilamentMm / 1000).toFixed(1)} m`}
                    sub={m.stats_filament_g({ g: data.totalFilamentG })}
                    extra={data.materials.map((x) => x.material).join(' · ')}
                />
                {hasCost ? (
                    <Tile
                        label={m.stats_cost()}
                        value={money(data.totalCost)}
                        sub={m.stats_cost_avg({ value: money(data.totalCost / Math.max(1, data.totalJobs)) })}
                        extra={
                            data.unpricedG > 0
                                ? m.stats_cost_unpriced({ g: data.unpricedG })
                                : m.stats_cost_all_priced()
                        }
                    />
                ) : null}
            </div>
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

                {data.printers.length > 1 ? (
                    <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-lg font-medium">{m.stats_printers()}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                {data.printers.map((p) => (
                                    <li key={p.printerId} className="rounded-2xl bg-secondary/60 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="truncate text-sm font-medium">{p.name}</span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                                {Math.round((p.durationSec / Math.max(1, data.totalDurationSec)) * 100)}{' '}
                                                %
                                            </span>
                                        </div>
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                                            <div
                                                className="h-full rounded-full bg-primary"
                                                style={{
                                                    width: `${(p.durationSec / Math.max(1, data.totalDurationSec)) * 100}%`,
                                                }}
                                            />
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
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ) : null}

                <Card
                    className={cn(
                        'rounded-3xl border-0 shadow-none md:col-span-2',
                        data.printers.length > 1 ? '' : 'xl:col-span-4',
                    )}
                >
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">{m.stats_materials()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.materials.length ? (
                            <div className={cn('grid gap-4', data.printers.length > 1 ? '' : 'xl:grid-cols-2')}>
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

function derive(b: StatsBucket): { hours: number; failed: number } {
    return { hours: Math.round(b.durationSec / 360) / 10, failed: b.jobs - b.completed };
}

function Tile({ label, value, sub, extra }: { label: string; value: string; sub: string; extra?: string }) {
    return (
        <Card className="gap-2 rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
                <div className="text-4xl font-semibold tracking-tight tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
                {extra ? <div className="truncate text-xs text-muted-foreground/70">{extra}</div> : null}
            </CardContent>
        </Card>
    );
}

function Empty() {
    return <p className="py-10 text-center text-sm text-muted-foreground">{m.stats_empty()}</p>;
}
