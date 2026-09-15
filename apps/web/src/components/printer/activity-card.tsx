import { useMemo } from 'react';
import { StatusBadge } from '@/components/printer/status-badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline, type SparklinePoint } from '@/components/viz/sparkline';
import { usePrintClock } from '@/hooks/use-print-clock';
import { useLiveState, useSamples, useSamplesReady } from '@/hooks/use-printers';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';

export function ActivityCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const samples = useSamples(printerId);
    const ready = useSamplesReady(printerId);
    const clock = usePrintClock(state);
    const nozzle = useMemo(() => samples.map((s) => ({ t: s.t, value: s.nozzle })), [samples]);
    const bed = useMemo(() => samples.map((s) => ({ t: s.t, value: s.bed })), [samples]);
    const progress = useMemo(() => samples.map((s) => ({ t: s.t, value: s.progress * 100 })), [samples]);
    const active = state.printState === 'printing' || state.printState === 'paused';
    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">{m.activity_title()}</CardTitle>
                <CardAction>
                    <StatusBadge state={state} />
                </CardAction>
            </CardHeader>
            <CardContent className="grid gap-8 md:grid-cols-3">
                <Stat
                    id="nozzle"
                    title={m.activity_nozzle()}
                    unit=" °C"
                    value={`${Math.round(state.nozzleTemp)}°`}
                    series={nozzle}
                    ready={ready}
                    label={`${Math.round(state.nozzleTemp)}°`}
                    color="var(--chart-1)"
                    rows={[
                        [m.activity_target(), `${Math.round(state.nozzleTarget)} °C`],
                        [m.activity_fan(), `${state.fanSpeed} %`],
                    ]}
                />
                <Stat
                    id="bed"
                    title={m.activity_bed()}
                    unit=" °C"
                    value={`${Math.round(state.bedTemp)}°`}
                    series={bed}
                    ready={ready}
                    label={`${Math.round(state.bedTemp)}°`}
                    color="var(--chart-2)"
                    rows={[
                        [m.activity_target(), `${Math.round(state.bedTarget)} °C`],
                        [m.activity_firmware(), state.firmwareVersion === 'unknown' ? '—' : state.firmwareVersion],
                    ]}
                />
                <Stat
                    id="progress"
                    title={m.activity_print_time()}
                    unit=" %"
                    value={active ? formatDuration(clock.elapsedSec, { zero: true }) : '—'}
                    series={progress}
                    ready={ready}
                    label={active ? `${Math.round(state.progress * 100)} %` : undefined}
                    color="var(--chart-3)"
                    rows={[
                        [m.activity_estimated(), state.slicerTimeSec ? formatDuration(state.slicerTimeSec) : '—'],
                        [m.activity_remaining(), active ? formatDuration(clock.remainSec, { zero: true }) : '—'],
                    ]}
                />
            </CardContent>
        </Card>
    );
}

function Stat({
    id,
    title,
    unit,
    value,
    series,
    ready,
    label,
    color,
    rows,
}: {
    id: string;
    title: string;
    unit: string;
    value: string;
    series: SparklinePoint[];
    ready: boolean;
    label?: string;
    color: string;
    rows: [string, string][];
}) {
    return (
        <div className="@container space-y-3">
            {ready ? (
                <Sparkline
                    id={id}
                    name={title}
                    unit={unit}
                    data={series}
                    label={label}
                    color={color}
                    className="h-28 w-full"
                />
            ) : (
                <div className="h-28 w-full" />
            )}
            <div className="text-base text-muted-foreground">{title}</div>
            <div className="whitespace-nowrap font-semibold text-[clamp(1.75rem,11cqw,3rem)] leading-none tracking-tight tabular-nums">
                {value}
            </div>
            <dl className="space-y-1 text-sm">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="tabular-nums">{v}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
