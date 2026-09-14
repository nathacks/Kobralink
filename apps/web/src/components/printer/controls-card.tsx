import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fan, Gauge, Lightbulb, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { powerStatusQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useLiveState, usePrinter, usePrintersStore } from '@/stores/printers';

const SPEED_MODES = [
    { value: 1, label: m.controls_speed_quiet },
    { value: 2, label: m.controls_speed_standard },
    { value: 3, label: m.controls_speed_fast },
    { value: 4, label: m.controls_speed_ultra },
];

export function ControlsCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const offline = !state.connected;
    const busy = state.printState === 'printing';
    const patchLiveState = usePrintersStore((s) => s.patchLiveState);
    const qc = useQueryClient();
    const printer = usePrinter(printerId);
    const powerConfigured = Boolean(printer?.settings.powerOnUrl || printer?.settings.powerOffUrl);
    const power = useQuery(powerStatusQuery(printerId, powerConfigured));
    const powerMut = useMutation({
        mutationFn: (action: 'on' | 'off') => api.printers.power(printerId, action),
        onSuccess: (r) => {
            toast.success(r.state === 'on' ? m.controls_power_on_toast() : m.controls_power_off_toast());
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'power'] });
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const onError = (e: Error) => toast.error(e.message);
    const fanMut = useMutation({ mutationFn: (speed: number) => api.control.fan(printerId, { speed }), onError });
    const lightMut = useMutation({
        mutationFn: (input: { on: boolean }) => api.control.light(printerId, input),
        onError,
    });
    const speedMut = useMutation({ mutationFn: (mode: number) => api.control.speed(printerId, { mode }), onError });

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">{m.controls_title()}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-evenly gap-4">
                <Row icon={<Fan />} label={m.controls_part_fan()} value={`${state.fanSpeed} %`}>
                    <Slider
                        value={[state.fanSpeed]}
                        min={0}
                        max={100}
                        step={5}
                        disabled={offline}
                        onValueChange={([v]) => patchLiveState(printerId, { fanSpeed: v })}
                        onValueCommit={([v]) => fanMut.mutate(v)}
                    />
                </Row>
                <Row
                    icon={<Lightbulb />}
                    label={m.controls_light()}
                    value={
                        <Switch
                            checked={state.lightOn}
                            disabled={offline || lightMut.isPending}
                            onCheckedChange={(on) => lightMut.mutate({ on })}
                        />
                    }
                />
                {powerConfigured && (
                    <Row
                        icon={<Power />}
                        label={m.controls_power()}
                        value={
                            <Switch
                                checked={
                                    power.data?.state === 'on' || (power.data?.state === 'unknown' && state.connected)
                                }
                                disabled={powerMut.isPending || busy}
                                onCheckedChange={(on) => powerMut.mutate(on ? 'on' : 'off')}
                            />
                        }
                    >
                        <p className="text-xs text-muted-foreground">
                            {power.isError
                                ? m.controls_plug_unreachable()
                                : power.data?.state === 'unknown'
                                  ? m.controls_plug_unknown()
                                  : power.data?.state === 'on'
                                    ? m.controls_plug_on()
                                    : m.controls_plug_off()}
                            {busy ? ` · ${m.controls_locked_printing()}` : ''}
                        </p>
                    </Row>
                )}
                <Row icon={<Gauge />} label={m.controls_speed()} value={busy ? '' : m.controls_speed_hint()}>
                    <div className="flex gap-1 rounded-full bg-secondary p-1">
                        {SPEED_MODES.map((mode) => (
                            <button
                                key={mode.value}
                                type="button"
                                disabled={offline || !busy}
                                onClick={() => speedMut.mutate(mode.value)}
                                className={cn(
                                    'flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                                    state.printSpeedMode === mode.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {mode.label()}
                            </button>
                        ))}
                    </div>
                </Row>
            </CardContent>
        </Card>
    );
}

function Row({
    icon,
    label,
    value,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground">
                    {icon}
                    {label}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">{value}</span>
            </div>
            {children}
        </div>
    );
}
