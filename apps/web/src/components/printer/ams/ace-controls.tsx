import { type AceUnit, aceDryFormSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { Droplets, Thermometer } from 'lucide-react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatMinutes } from '@/lib/format';
import { m } from '@/lib/i18n';

export function AceControls({
    printerId,
    units,
    disabled,
    busy,
}: {
    printerId: string;
    units: AceUnit[];
    disabled: boolean;
    busy: boolean;
}) {
    const onError = (e: Error) => toast.error(e.message);
    const autoFeed = useMutation({
        mutationFn: (input: { aceId: number; on: boolean }) => api.ams.autoFeed(printerId, input),
        onError,
    });
    const dry = useMutation({
        mutationFn: (input: { action: 'start' | 'stop'; targetTemp?: number; duration?: number }) =>
            api.ams.dry(printerId, input),
        onSuccess: (_, v) => toast.success(v.action === 'start' ? m.ace_dry_started() : m.ace_dry_stopped()),
        onError,
    });
    const drying = units.find((u) => u.drying.status !== 0)?.drying ?? units[0].drying;
    const active = drying.status !== 0;

    const form = useForm({
        defaultValues: { targetTemp: 45, duration: 240 },
        validators: { onSubmit: aceDryFormSchema },
        onSubmit: ({ value }) => dry.mutateAsync({ action: 'start', ...value }).catch(() => undefined),
    });

    return (
        <div className="space-y-3 rounded-2xl bg-secondary/60 p-4">
            {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-medium">{m.ace_unit({ n: u.id + 1 })}</div>
                        <div className="text-xs text-muted-foreground">{m.ace_auto_feed()}</div>
                    </div>
                    <Switch
                        checked={u.autoFeed}
                        disabled={disabled || autoFeed.isPending}
                        onCheckedChange={(on) => autoFeed.mutate({ aceId: u.id, on })}
                    />
                </div>
            ))}

            <div className="border-t pt-3">
                <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-medium">{m.ace_drying()}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {drying.currentTemp !== null && (
                            <span className="flex items-center gap-1">
                                <Thermometer className="size-3.5" /> {Math.round(drying.currentTemp)} °C
                            </span>
                        )}
                        {drying.humidity !== null && (
                            <span className="flex items-center gap-1">
                                <Droplets className="size-3.5" /> {Math.round(drying.humidity)} %
                            </span>
                        )}
                    </div>
                </div>
                {active ? (
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-sm">
                            {m.ace_drying_status({
                                temp: drying.targetTemp,
                                duration: formatMinutes(drying.remainTime),
                            })}
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="rounded-full"
                            disabled={disabled || dry.isPending}
                            onClick={() => dry.mutate({ action: 'stop' })}
                        >
                            {m.common_stop()}
                        </Button>
                    </div>
                ) : (
                    <form
                        noValidate
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void form.handleSubmit();
                        }}
                    >
                        <form.Field name="targetTemp">
                            {(field) => (
                                <div className="grid gap-1">
                                    <Label className="text-xs text-muted-foreground">{m.ace_temperature()}</Label>
                                    <Input
                                        type="number"
                                        min={30}
                                        max={80}
                                        className="w-20 rounded-full text-center"
                                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                        disabled={disabled}
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            )}
                        </form.Field>
                        <form.Field name="duration">
                            {(field) => (
                                <div className="grid gap-1">
                                    <Label className="text-xs text-muted-foreground">{m.ace_duration()}</Label>
                                    <Input
                                        type="number"
                                        min={10}
                                        max={1440}
                                        step={10}
                                        className="w-24 rounded-full text-center"
                                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                        disabled={disabled}
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            )}
                        </form.Field>
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                            {(isSubmitting) => (
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={disabled || busy || isSubmitting}
                                >
                                    {m.ace_start()}
                                </Button>
                            )}
                        </form.Subscribe>
                    </form>
                )}
            </div>
        </div>
    );
}
