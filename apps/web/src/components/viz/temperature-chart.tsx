import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { intlLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface TemperaturePoint {
    t: number;
    nozzle: number;
    bed: number;
}

export interface TemperatureSeries {
    key: 'nozzle' | 'bed';
    label: string;
    color: string;
    target: number;
}

const STEP = 50;

export function temperatureCeiling(points: TemperaturePoint[], targets: number[]): number {
    const peak = Math.max(0, ...targets, ...points.flatMap((p) => [p.nozzle, p.bed]));
    return Math.max(STEP, Math.ceil((peak + 10) / STEP) * STEP);
}

function clock(t: number): string {
    return new Date(t).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' });
}

export function TemperatureChart({
    data,
    series,
    className,
}: {
    data: TemperaturePoint[];
    series: TemperatureSeries[];
    className?: string;
}) {
    const ceiling = temperatureCeiling(
        data,
        series.map((s) => s.target),
    );
    const config = Object.fromEntries(
        series.map((s) => [s.key, { label: s.label, color: s.color }]),
    ) satisfies ChartConfig;

    return (
        <ChartContainer config={config} className={cn('aspect-auto w-full', className)}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={clock}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={48}
                />
                <YAxis
                    domain={[0, ceiling]}
                    tickCount={ceiling / STEP + 1}
                    tickFormatter={(v: number) => `${v}°`}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                />
                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            indicator="dot"
                            labelFormatter={(_, payload) => {
                                const t = payload?.[0]?.payload?.t as number | undefined;
                                return t ? clock(t) : '';
                            }}
                            formatter={(value, name) => (
                                <div className="flex flex-1 items-center justify-between gap-3">
                                    <span className="flex items-center gap-2 text-muted-foreground">
                                        <span
                                            className="size-2 rounded-full"
                                            style={{ background: `var(--color-${name})` }}
                                        />
                                        {config[name as TemperatureSeries['key']]?.label}
                                    </span>
                                    <span className="font-mono font-medium tabular-nums text-foreground">
                                        {Math.round(Number(value))} °C
                                    </span>
                                </div>
                            )}
                        />
                    }
                />
                {series.map((s) =>
                    s.target > 0 ? (
                        <ReferenceLine
                            key={`${s.key}-target`}
                            y={s.target}
                            stroke={`var(--color-${s.key})`}
                            strokeDasharray="6 4"
                            strokeOpacity={0.7}
                        />
                    ) : null,
                )}
                {series.map((s) => (
                    <Line
                        key={s.key}
                        dataKey={s.key}
                        type="monotone"
                        stroke={`var(--color-${s.key})`}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                        isAnimationActive={false}
                    />
                ))}
            </LineChart>
        </ChartContainer>
    );
}
