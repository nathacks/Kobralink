import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TemperatureChart } from '@/components/viz/temperature-chart';
import { useLiveState, useSamples, useSamplesReady } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Panel, Segmented } from './panel';

const PRESETS = [
    { key: 'pla', label: () => 'PLA', nozzle: 210, bed: 60 },
    { key: 'petg', label: () => 'PETG', nozzle: 235, bed: 75 },
    { key: 'abs', label: () => 'ABS', nozzle: 250, bed: 95 },
    { key: 'off', label: m.temp_preset_off, nozzle: 0, bed: 0 },
];

const NOZZLE_COLOR = 'var(--chart-1)';
const BED_COLOR = 'var(--chart-2)';

export function TemperatureCard({ printerId, className }: { printerId: string; className?: string }) {
    const state = useLiveState(printerId);
    const samples = useSamples(printerId);
    const ready = useSamplesReady(printerId);
    const data = useMemo(() => samples.map((s) => ({ t: s.t, nozzle: s.nozzle, bed: s.bed })), [samples]);
    const set = useMutation({
        mutationFn: (input: { nozzle?: number; bed?: number }) => api.control.temperature(printerId, input),
        onError: (e) => toast.error(e.message),
    });
    const offline = !state.connected;

    return (
        <Panel
            className={className}
            title={m.temp_title()}
            action={
                <Segmented
                    label={m.temp_title()}
                    options={PRESETS.map((p) => ({ value: p.key, label: p.label() }))}
                    disabled={offline || set.isPending}
                    onSelect={(key) => {
                        const p = PRESETS.find((x) => x.key === key);
                        if (p) set.mutate({ nozzle: p.nozzle, bed: p.bed });
                    }}
                />
            }
        >
            <div className="@container flex flex-1 flex-col">
                <div className="grid flex-1 grid-rows-[auto_1fr] gap-5 @2xl:grid-cols-[minmax(14rem,17rem)_1fr] @2xl:grid-rows-1">
                    <div className="grid content-start gap-3 @md:grid-cols-2 @2xl:grid-cols-1">
                        <HeaterTile
                            label={m.activity_nozzle()}
                            color={NOZZLE_COLOR}
                            current={state.nozzleTemp}
                            target={state.nozzleTarget}
                            max={320}
                            onSet={(v) => set.mutate({ nozzle: v })}
                            disabled={offline}
                        />
                        <HeaterTile
                            label={m.activity_bed()}
                            color={BED_COLOR}
                            current={state.bedTemp}
                            target={state.bedTarget}
                            max={120}
                            onSet={(v) => set.mutate({ bed: v })}
                            disabled={offline}
                        />
                    </div>
                    <div className="min-h-56 min-w-0" data-testid="temperature-chart">
                        {ready && data.length > 1 && (
                            <TemperatureChart
                                className="h-full min-h-56"
                                data={data}
                                series={[
                                    {
                                        key: 'nozzle',
                                        label: m.activity_nozzle(),
                                        color: NOZZLE_COLOR,
                                        target: state.nozzleTarget,
                                    },
                                    { key: 'bed', label: m.activity_bed(), color: BED_COLOR, target: state.bedTarget },
                                ]}
                            />
                        )}
                    </div>
                </div>
            </div>
        </Panel>
    );
}

export function HeaterTile({
    label,
    color,
    current,
    target,
    max,
    onSet,
    disabled,
}: {
    label: string;
    color: string;
    current: number;
    target: number;
    max: number;
    onSet: (v: number) => void;
    disabled: boolean;
}) {
    const form = useForm({
        defaultValues: { value: target },
        validators: {
            onSubmit: ({ value }) =>
                Number.isFinite(value.value) && value.value >= 0 && value.value <= max
                    ? undefined
                    : { fields: { value: m.temp_range({ max }) } },
        },
        onSubmit: ({ value }) => onSet(value.value),
    });
    useEffect(() => form.setFieldValue('value', target), [form, target]);
    const heating = target > 0;
    const pct = heating ? Math.min(1, current / target) : 0;

    return (
        <form
            aria-label={label}
            className="flex flex-col gap-3 rounded-2xl bg-secondary/60 p-4"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="size-2.5 rounded-full" style={{ background: color }} />
                    {label}
                </span>
                {heating && (
                    <Flame className={cn('size-4', pct < 0.97 && 'animate-pulse')} style={{ color }} aria-hidden />
                )}
            </div>
            <div className="flex items-baseline gap-2 tabular-nums">
                <span className="text-4xl font-semibold leading-none tracking-tight">{Math.round(current)}°</span>
                <span className="text-sm text-muted-foreground">
                    {m.activity_target()} {Math.round(target)} °C
                </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
                <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct * 100}%`, background: color }}
                />
            </div>
            <div className="flex gap-2">
                <form.Field name="value">
                    {(field) => (
                        <Input
                            type="number"
                            min={0}
                            max={max}
                            aria-label={`${label} · ${m.activity_target()}`}
                            className="h-9 min-w-0 flex-1 rounded-full bg-background/60 text-center tabular-nums"
                            value={Number.isNaN(field.state.value) ? '' : field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                            aria-invalid={fieldInvalid(field.state.meta)}
                            title={field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined}
                            disabled={disabled}
                        />
                    )}
                </form.Field>
                <Button type="submit" className="h-9 rounded-full px-5" disabled={disabled}>
                    {m.temp_set()}
                </Button>
            </div>
        </form>
    );
}
