import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Fan,
    Feather,
    Gauge,
    Home,
    Lightbulb,
    LightbulbOff,
    Move,
    Plug,
    PlugZap,
    Power,
    SlidersHorizontal,
    Zap,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { powerStatusQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { printersStore } from '@/stores/printers';
import { Panel, Segmented } from './panel';

const SPEED_MODES = [
    { value: 1, label: m.controls_speed_quiet, icon: <Feather /> },
    { value: 2, label: m.controls_speed_standard, icon: <Gauge /> },
    { value: 3, label: m.controls_speed_fast, icon: <Zap /> },
];

const AXIS = { X: 1, Y: 2, Z: 3, XY: 4, XYZ: 5 } as const;
const HOME = 2;
const DISTANCES = [1, 10, 50];

type Tab = 'controls' | 'axes';

export function ControlsCard({ printerId, className }: { printerId: string; className?: string }) {
    const [tab, setTab] = useState<Tab>('controls');
    return (
        <Panel
            className={cn('gap-4 p-4 sm:p-5', className)}
            title={m.controls_title()}
            action={
                <Segmented<Tab>
                    label={m.controls_title()}
                    options={[
                        { value: 'controls', title: m.controls_title(), label: <SlidersHorizontal /> },
                        { value: 'axes', title: m.axes_title(), label: <Move /> },
                    ]}
                    value={tab}
                    onSelect={setTab}
                />
            }
        >
            {tab === 'controls' ? <Toggles printerId={printerId} /> : <AxesPad printerId={printerId} />}
        </Panel>
    );
}

function AxesPad({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const locked = !state.connected || state.printState === 'printing';
    const [distance, setDistance] = useState(10);
    const onError = (e: Error) => toast.error(e.message);
    const axisMut = useMutation({
        mutationFn: (input: { axis: number; moveType: number; distance: number }) => api.control.axis(printerId, input),
        onError,
    });
    const offMut = useMutation({ mutationFn: () => api.control.axisOff(printerId), onError });
    const jog = (axis: number, moveType: number) => axisMut.mutate({ axis, moveType, distance });
    const home = (axis: number) => axisMut.mutate({ axis, moveType: HOME, distance: 0 });

    return (
        <div className="flex flex-col items-center gap-4">
            <p className="w-full text-center text-xs text-muted-foreground">
                X/Z · {m.axes_nozzle()} — Y · {m.axes_bed()}
            </p>
            <div className="flex items-center gap-5">
                <div className="grid grid-cols-3 gap-2">
                    <span />
                    <Jog onClick={() => jog(AXIS.Y, 0)} disabled={locked} title={`Y- · ${m.axes_bed()}`}>
                        <ArrowUp />
                    </Jog>
                    <span />
                    <Jog onClick={() => jog(AXIS.X, 0)} disabled={locked} title={`X- · ${m.axes_nozzle()}`}>
                        <ArrowLeft />
                    </Jog>
                    <Jog onClick={() => home(AXIS.XY)} disabled={locked} title={m.axes_home_xy()}>
                        <Home />
                    </Jog>
                    <Jog onClick={() => jog(AXIS.X, 1)} disabled={locked} title={`X+ · ${m.axes_nozzle()}`}>
                        <ArrowRight />
                    </Jog>
                    <span />
                    <Jog onClick={() => jog(AXIS.Y, 1)} disabled={locked} title={`Y+ · ${m.axes_bed()}`}>
                        <ArrowDown />
                    </Jog>
                    <span />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Jog onClick={() => jog(AXIS.Z, 1)} disabled={locked} title="Z+">
                        <ArrowUp />
                    </Jog>
                    <Jog onClick={() => home(AXIS.Z)} disabled={locked} title={m.axes_home_z()}>
                        <Home />
                    </Jog>
                    <Jog onClick={() => jog(AXIS.Z, 0)} disabled={locked} title="Z-">
                        <ArrowDown />
                    </Jog>
                </div>
            </div>
            <Segmented
                className="w-full"
                label={m.axes_title()}
                options={DISTANCES.map((d) => ({ value: d, label: `${d} mm` }))}
                value={distance}
                onSelect={setDistance}
            />
            <div className="grid w-full grid-cols-2 gap-2">
                <Button className="h-9 rounded-full" disabled={locked} onClick={() => home(AXIS.XYZ)}>
                    <Home /> {m.axes_home()}
                </Button>
                <Button
                    variant="secondary"
                    className="h-9 rounded-full"
                    disabled={locked}
                    onClick={() => offMut.mutate()}
                >
                    <Power /> {m.axes_motors_off()}
                </Button>
            </div>
        </div>
    );
}

function Toggles({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const offline = !state.connected;
    const busy = state.printState === 'printing';
    const patchLiveState = printersStore.actions.patchLiveState;
    const qc = useQueryClient();
    const printer = usePrinter(printerId);
    const powerSet = Boolean(
        printer?.settings.plugSwitch || printer?.settings.powerOnUrl || printer?.settings.powerOffUrl,
    );
    const power = useQuery(powerStatusQuery(printerId, powerSet));
    const powerConfigured = powerSet && power.data?.configured !== false;
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
        mutationFn: (on: boolean) => api.control.light(printerId, { on }),
        onError,
    });
    const speedMut = useMutation({ mutationFn: (mode: number) => api.control.speed(printerId, { mode }), onError });

    const powerOn = power.data?.state === 'on' || (power.data?.state === 'unknown' && state.connected);
    const powerStatus = power.isError
        ? m.controls_plug_unreachable()
        : power.data?.state === 'unknown'
          ? m.controls_plug_unknown()
          : power.data?.state === 'on'
            ? m.controls_plug_on()
            : m.controls_plug_off();

    return (
        <div className="flex min-w-0 flex-col divide-y divide-border">
            <Row
                icon={state.lightOn ? <Lightbulb /> : <LightbulbOff />}
                label={m.controls_light()}
                status={state.lightOn ? m.controls_on() : m.controls_off()}
                active={state.lightOn}
                control={
                    <Button
                        type="button"
                        size="sm"
                        variant={state.lightOn ? 'default' : 'secondary'}
                        aria-pressed={state.lightOn}
                        disabled={offline || lightMut.isPending}
                        onClick={() => lightMut.mutate(!state.lightOn)}
                        className="rounded-full px-4"
                    >
                        {state.lightOn ? m.controls_light_turn_off() : m.controls_light_turn_on()}
                    </Button>
                }
            />
            {powerConfigured && (
                <Row
                    icon={powerOn ? <PlugZap /> : <Plug />}
                    label={m.controls_power()}
                    status={busy ? `${powerStatus} · ${m.controls_locked_printing()}` : powerStatus}
                    active={powerOn}
                    control={
                        <Switch
                            aria-label={m.controls_power()}
                            checked={powerOn}
                            disabled={powerMut.isPending || busy}
                            onCheckedChange={(on) => powerMut.mutate(on ? 'on' : 'off')}
                        />
                    }
                />
            )}

            <Row
                icon={
                    <Fan
                        className={cn(state.fanSpeed > 0 && 'animate-spin')}
                        style={{ animationDuration: `${Math.max(0.6, 3 - state.fanSpeed / 40)}s` }}
                    />
                }
                label={m.controls_part_fan()}
                status={`${state.fanSpeed} %`}
                active={state.fanSpeed > 0}
            >
                <Slider
                    aria-label={m.controls_part_fan()}
                    value={[state.fanSpeed]}
                    min={0}
                    max={100}
                    step={5}
                    disabled={offline}
                    onValueChange={([v]) => patchLiveState(printerId, { fanSpeed: v })}
                    onValueCommit={([v]) => fanMut.mutate(v)}
                />
            </Row>
            <Row icon={<Gauge />} label={m.controls_speed()} status={busy ? '' : m.controls_speed_hint()} active={busy}>
                <Segmented
                    label={m.controls_speed()}
                    options={SPEED_MODES.map((s) => ({ value: s.value, label: s.label(), icon: s.icon }))}
                    value={state.printSpeedMode}
                    disabled={offline || !busy}
                    onSelect={(mode) => speedMut.mutate(mode)}
                />
            </Row>
        </div>
    );
}

function Row({
    icon,
    label,
    status,
    active,
    control,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    status: string;
    active: boolean;
    control?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors [&_svg]:size-4',
                        active ? 'bg-primary/15 text-primary-strong' : 'bg-secondary text-muted-foreground',
                    )}
                >
                    {icon}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    {status && (
                        <span className="block truncate text-xs text-muted-foreground tabular-nums">{status}</span>
                    )}
                </span>
                {control}
            </div>
            {children}
        </div>
    );
}

function Jog({ primary, className, ...props }: React.ComponentProps<'button'> & { primary?: boolean }) {
    return (
        <button
            type="button"
            aria-label={props.title}
            {...props}
            className={cn(
                'flex size-11 items-center justify-center rounded-2xl transition-colors disabled:opacity-40 [&_svg]:size-5',
                primary
                    ? 'bg-primary text-primary-foreground enabled:hover:bg-primary/90'
                    : 'bg-secondary text-foreground enabled:hover:bg-accent',
                className,
            )}
        />
    );
}
