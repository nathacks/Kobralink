import type { StatsDto } from '@kobralink/shared';
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
import { formatDuration } from '@/lib/format';
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
            {stats.data ? <StatsBody data={stats.data} /> : <Skeleton className="h-96 rounded-3xl" />}
        </div>
    );
}

function StatsBody({ data }: { data: StatsDto }) {
    const monthFmt = new Intl.DateTimeFormat(intlLocale(), { month: 'short', year: '2-digit' });
    const dayFmt = new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' });
    const months = data.months.map((b) => {
        const [y, mo] = b.key.split('-').map(Number);
        return {
            ...b,
            label: monthFmt.format(new Date(y, mo - 1, 1)),
            hours: Math.round(b.durationSec / 360) / 10,
            failed: b.jobs - b.completed,
        };
    });
    const weekdays = [...data.weekdays.slice(1), data.weekdays[0]].map((b) => ({
        ...b,
        label: dayFmt.format(new Date(2024, 0, 1 + ((Number(b.key) + 6) % 7))),
        failed: b.jobs - b.completed,
    }));
    const jobsConfig = {
        completed: { label: m.stats_completed(), color: 'var(--chart-1)' },
        failed: { label: m.stats_failed(), color: 'var(--chart-5)' },
    } satisfies ChartConfig;
    const hoursConfig = { hours: { label: m.stats_hours(), color: 'var(--chart-3)' } } satisfies ChartConfig;
    const materialConfig = {
        weightG: { label: m.stats_material_weight(), color: 'var(--chart-2)' },
    } satisfies ChartConfig;

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Tile
                label={m.stats_total_jobs()}
                value={String(data.totalJobs)}
                sub={m.stats_success_rate({ pct: Math.round(data.successRate * 100) })}
            />
            <Tile
                label={m.stats_total_time()}
                value={formatDuration(data.totalDurationSec)}
                sub={m.stats_avg({ duration: formatDuration(data.avgDurationSec) })}
            />
            <Tile
                label={m.stats_longest()}
                value={formatDuration(data.longestDurationSec)}
                sub={m.stats_cancelled_n({ n: data.cancelled + data.errored })}
            />
            <Tile
                label={m.stats_filament()}
                value={`${(data.totalFilamentMm / 1000).toFixed(1)} m`}
                sub={m.stats_filament_g({ g: data.totalFilamentG })}
            />

            <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">{m.stats_jobs_per_month()}</CardTitle>
                </CardHeader>
                <CardContent>
                    {months.length ? (
                        <ChartContainer config={jobsConfig} className="h-64 w-full">
                            <BarChart data={months} margin={{ left: 0, right: 8 }}>
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
                    ) : (
                        <Empty />
                    )}
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">{m.stats_hours_per_month()}</CardTitle>
                </CardHeader>
                <CardContent>
                    {months.length ? (
                        <ChartContainer config={hoursConfig} className="h-64 w-full">
                            <BarChart data={months} margin={{ left: 0, right: 8 }}>
                                <CartesianGrid vertical={false} strokeOpacity={0.3} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} />
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
                            <Bar dataKey="completed" stackId="a" fill="var(--color-completed)" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="failed" stackId="a" fill="var(--color-failed)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">{m.stats_materials()}</CardTitle>
                </CardHeader>
                <CardContent>
                    {data.materials.length ? (
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
                        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
                                            })}
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
    );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardContent className="space-y-1 pt-6">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="text-4xl font-semibold tracking-tight tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
            </CardContent>
        </Card>
    );
}

function Empty() {
    return <p className="py-10 text-center text-sm text-muted-foreground">{m.stats_empty()}</p>;
}
