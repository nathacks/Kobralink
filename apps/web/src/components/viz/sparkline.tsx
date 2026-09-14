import { Area, AreaChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { intlLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface SparklinePoint {
    t: number;
    value: number;
}

interface Props {
    data: SparklinePoint[];
    id: string;
    name: string;
    unit?: string;
    className?: string;
    color?: string;
    label?: string;
}

export function Sparkline({ data, id, name, unit = '', className, color = 'var(--primary)', label }: Props) {
    const points =
        data.length >= 2
            ? data
            : [
                  { t: 0, value: data[0]?.value ?? 0 },
                  { t: 1, value: data[0]?.value ?? 0 },
              ];
    const last = points[points.length - 1];
    const min = Math.min(...points.map((p) => p.value));
    const max = Math.max(...points.map((p) => p.value));
    const yDomain: [number, number] = [min, max === min ? min + 1 : max];
    const config = { [id]: { label: name, color } } satisfies ChartConfig;
    const gradientId = `fill-${id}`;

    return (
        <ChartContainer
            config={config}
            className={cn(
                'aspect-auto overflow-visible outline-none [&_svg]:overflow-visible [&_svg]:outline-none [&_.recharts-wrapper]:outline-none',
                className,
            )}
        >
            <AreaChart
                data={points}
                accessibilityLayer={false}
                tabIndex={-1}
                margin={{ top: 30, right: 8, bottom: 0, left: 8 }}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={`var(--color-${id})`} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={`var(--color-${id})`} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <XAxis hide dataKey="t" type="number" domain={['dataMin', 'dataMax']} />
                <YAxis hide domain={yDomain} />
                <ChartTooltip
                    cursor={{ stroke: `var(--color-${id})`, strokeDasharray: '4 4', strokeOpacity: 0.6 }}
                    content={
                        <ChartTooltipContent
                            indicator="dot"
                            labelFormatter={(_, payload) => {
                                const t = payload?.[0]?.payload?.t as number | undefined;
                                return t && t > 1 ? new Date(t).toLocaleTimeString(intlLocale()) : name;
                            }}
                            formatter={(value) => (
                                <div className="flex flex-1 items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{name}</span>
                                    <span className="font-mono font-medium tabular-nums text-foreground">
                                        {Math.round(Number(value))}
                                        {unit}
                                    </span>
                                </div>
                            )}
                        />
                    }
                />
                <Area
                    dataKey="value"
                    name={id}
                    type="monotone"
                    fill={`url(#${gradientId})`}
                    stroke={`var(--color-${id})`}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                />
                <ReferenceLine
                    segment={[
                        { x: last.t, y: last.value },
                        { x: last.t, y: min },
                    ]}
                    stroke={`var(--color-${id})`}
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    ifOverflow="visible"
                />
                <ReferenceDot
                    x={last.t}
                    y={last.value}
                    r={6}
                    fill={`var(--color-${id})`}
                    stroke="var(--card)"
                    strokeWidth={2}
                    ifOverflow="visible"
                    label={label ? <PillLabel text={label} color={`var(--color-${id})`} /> : undefined}
                />
            </AreaChart>
        </ChartContainer>
    );
}

function PillLabel({ text, color, viewBox }: { text: string; color: string; viewBox?: { x?: number; y?: number } }) {
    const x = viewBox?.x ?? 0;
    const y = viewBox?.y ?? 0;
    const w = text.length * 7 + 16;
    const h = 20;
    return (
        <g transform={`translate(${x - w / 2}, ${y - h - 12})`}>
            <rect width={w} height={h} rx={h / 2} fill={color} />
            <text
                x={w / 2}
                y={h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                fill="var(--primary-foreground)"
            >
                {text}
            </text>
        </g>
    );
}
