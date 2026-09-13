import type { PrinterLiveState } from '@kobralink/shared';
import { StatusBadge } from '@/components/printer/status-badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline } from '@/components/viz/sparkline';
import { type Sample } from '@/hooks/use-printer-events';
import { formatDuration } from '@/lib/format';

export function ActivityCard({ state, samples }: { state: PrinterLiveState; samples: Sample[] }) {
    const nozzle = samples.map((s) => s.nozzle);
    const bed = samples.map((s) => s.bed);
    const progress = samples.map((s) => s.progress * 100);
    const active = state.printState === 'printing' || state.printState === 'paused';
    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">Activité</CardTitle>
                <CardAction>
                    <StatusBadge state={state} />
                </CardAction>
            </CardHeader>
            <CardContent className="grid gap-8 md:grid-cols-3">
                <Stat
                    title="Buse"
                    value={`${Math.round(state.nozzleTemp)}°`}
                    series={nozzle}
                    label={`${Math.round(state.nozzleTemp)}°`}
                    color="var(--chart-1)"
                    rows={[
                        ['Cible', `${Math.round(state.nozzleTarget)} °C`],
                        ['Ventilateur', `${state.fanSpeed} %`],
                    ]}
                />
                <Stat
                    title="Plateau"
                    value={`${Math.round(state.bedTemp)}°`}
                    series={bed}
                    label={`${Math.round(state.bedTemp)}°`}
                    color="var(--chart-2)"
                    rows={[
                        ['Cible', `${Math.round(state.bedTarget)} °C`],
                        ['Firmware', state.firmwareVersion === 'unknown' ? '—' : state.firmwareVersion],
                    ]}
                />
                <Stat
                    title="Temps d'impression"
                    value={active ? formatDuration(state.printDurationSec) : '—'}
                    series={progress}
                    label={active ? `${Math.round(state.progress * 100)} %` : undefined}
                    color="var(--chart-3)"
                    rows={[
                        ['Estimé', state.slicerTimeSec ? formatDuration(state.slicerTimeSec) : '—'],
                        ['Restant', active ? formatDuration(state.remainTimeSec) : '—'],
                    ]}
                />
            </CardContent>
        </Card>
    );
}

function Stat({
    title,
    value,
    series,
    label,
    color,
    rows,
}: {
    title: string;
    value: string;
    series: number[];
    label?: string;
    color: string;
    rows: [string, string][];
}) {
    return (
        <div className="space-y-3">
            <Sparkline values={series} label={label} color={color} className="h-24 w-full" />
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
