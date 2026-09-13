import { useMutation } from '@tanstack/react-query';
import { Fan, Gauge, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLiveState, usePrintersStore } from '@/stores/printers';

const SPEED_MODES = [
    { value: 1, label: 'Silencieux' },
    { value: 2, label: 'Standard' },
    { value: 3, label: 'Rapide' },
    { value: 4, label: 'Ultra' },
];

export function ControlsCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const offline = !state.connected;
    const busy = state.printState === 'printing';
    const patchLiveState = usePrintersStore((s) => s.patchLiveState);

    const onError = (e: Error) => toast.error(e.message);
    const fanMut = useMutation({ mutationFn: (speed: number) => api.control.fan(printerId, { speed }), onError });
    const lightMut = useMutation({
        mutationFn: (input: { on: boolean; brightness?: number }) => api.control.light(printerId, input),
        onError,
    });
    const speedMut = useMutation({ mutationFn: (mode: number) => api.control.speed(printerId, { mode }), onError });

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">Contrôles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <Row icon={<Fan />} label="Ventilateur pièce" value={`${state.fanSpeed} %`}>
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
                    label="Éclairage"
                    value={
                        <Switch
                            checked={state.lightOn}
                            disabled={offline || lightMut.isPending}
                            onCheckedChange={(on) => lightMut.mutate({ on, brightness: state.lightBrightness })}
                        />
                    }
                >
                    <Slider
                        value={[state.lightBrightness]}
                        min={0}
                        max={100}
                        step={5}
                        disabled={offline || lightMut.isPending || !state.lightOn}
                        onValueChange={([v]) => patchLiveState(printerId, { lightBrightness: v })}
                        onValueCommit={([v]) => lightMut.mutate({ on: true, brightness: v })}
                    />
                </Row>
                <Row icon={<Gauge />} label="Vitesse" value={busy ? '' : 'pendant une impression'}>
                    <div className="flex gap-1 rounded-full bg-secondary p-1">
                        {SPEED_MODES.map((m) => (
                            <button
                                key={m.value}
                                type="button"
                                disabled={offline || !busy}
                                onClick={() => speedMut.mutate(m.value)}
                                className={cn(
                                    'flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                                    state.printSpeedMode === m.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {m.label}
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
    children: React.ReactNode;
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
