import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLiveState } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

const PRESETS = [
    { label: () => 'PLA', nozzle: 210, bed: 60 },
    { label: () => 'PETG', nozzle: 235, bed: 75 },
    { label: () => 'ABS', nozzle: 250, bed: 95 },
    { label: m.temp_preset_off, nozzle: 0, bed: 0 },
];

export function TemperatureCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const set = useMutation({
        mutationFn: (input: { nozzle?: number; bed?: number }) => api.control.temperature(printerId, input),
        onError: (e) => toast.error(e.message),
    });

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">{m.temp_title()}</CardTitle>
                <CardAction className="flex gap-1 rounded-full bg-secondary p-1">
                    {PRESETS.map((p) => (
                        <button
                            key={p.nozzle}
                            type="button"
                            disabled={!state.connected || set.isPending}
                            onClick={() => set.mutate({ nozzle: p.nozzle, bed: p.bed })}
                            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                        >
                            {p.label()}
                        </button>
                    ))}
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
                <HeaterRow
                    label={m.activity_nozzle()}
                    current={state.nozzleTemp}
                    target={state.nozzleTarget}
                    max={320}
                    onSet={(v) => set.mutate({ nozzle: v })}
                    disabled={!state.connected}
                />
                <HeaterRow
                    label={m.activity_bed()}
                    current={state.bedTemp}
                    target={state.bedTarget}
                    max={120}
                    onSet={(v) => set.mutate({ bed: v })}
                    disabled={!state.connected}
                />
            </CardContent>
        </Card>
    );
}

function HeaterRow({
    label,
    current,
    target,
    max,
    onSet,
    disabled,
}: {
    label: string;
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
    const pct = max ? Math.min(1, current / max) : 0;
    return (
        <form
            className="space-y-2"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="flex items-center gap-3">
                <div className="w-20 text-sm text-muted-foreground">{label}</div>
                <div className="flex-1 text-2xl font-semibold tabular-nums">
                    {current.toFixed(0)}
                    <span className="text-sm font-normal text-muted-foreground"> / {target.toFixed(0)} °C</span>
                </div>
                <form.Field name="value">
                    {(field) => (
                        <Input
                            type="number"
                            min={0}
                            max={max}
                            className="w-24 rounded-full text-center"
                            value={Number.isNaN(field.state.value) ? '' : field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                            aria-invalid={fieldInvalid(field.state.meta)}
                            disabled={disabled}
                        />
                    )}
                </form.Field>
                <Button type="submit" size="sm" variant="secondary" className="rounded-full" disabled={disabled}>
                    {m.temp_set()}
                </Button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct * 100}%` }} />
            </div>
        </form>
    );
}
