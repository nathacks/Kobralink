import { StatusBadge } from '@/components/printer/status-badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline, type SparklinePoint } from '@/components/viz/sparkline';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { useLiveState, useSamples } from '@/stores/printers';

export function ActivityCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const samples = useSamples(printerId);
    const nozzle = samples.map((s) => ({ t: s.t, value: s.nozzle }));
    const bed = samples.map((s) => ({ t: s.t, value: s.bed }));
    const progress = samples.map((s) => ({ t: s.t, value: s.progress * 100 }));
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
                    value={active ? formatDuration(state.printDurationSec) : '—'}
                    series={progress}
                    label={active ? `${Math.round(state.progress * 100)} %` : undefined}
                    color="var(--chart-3)"
                    rows={[
                        [m.activity_estimated(), state.slicerTimeSec ? formatDuration(state.slicerTimeSec) : '—'],
                        [m.activity_remaining(), active ? formatDuration(state.remainTimeSec) : '—'],
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
    label,
    color,
    rows,
}: {
    id: string;
    title: string;
    unit: string;
    value: string;
    series: SparklinePoint[];
    label?: string;
    color: string;
    rows: [string, string][];
}) {
    return (
        <div className="space-y-3">
            <Sparkline
                id={id}
                name={title}
                unit={unit}
                data={series}
                label={label}
                color={color}
                className="h-28 w-full"
            />
            <div className="text-base text-muted-foreground">{title}</div>
            <div className="text-5xl font-semibold tracking-tight tabular-nums">{value}</div>
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
