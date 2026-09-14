import { type AceUnit, aceDryFormSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Droplets, Thermometer, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatDate, formatMinutes } from '@/lib/format';
import { m } from '@/lib/i18n';
import { appSettingsQuery, dryScheduleQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

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
    const qc = useQueryClient();
    const settings = useQuery(appSettingsQuery);
    const presets = settings.data?.aceDryPresets ?? [];
    const schedule = useQuery(dryScheduleQuery(printerId));
    const [scheduling, setScheduling] = useState(false);
    const [startAt, setStartAt] = useState(() => defaultStart());
    const addSchedule = useMutation({
        mutationFn: (input: { targetTemp: number; duration: number; startAt: string }) =>
            api.drySchedule.create(printerId, { ...input, aceId: null }),
        onSuccess: () => {
            toast.success(m.ace_schedule_added());
            setScheduling(false);
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'dry-schedule'] });
        },
        onError,
    });
    const removeSchedule = useMutation({
        mutationFn: (id: string) => api.drySchedule.remove(printerId, id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['printers', printerId, 'dry-schedule'] }),
        onError,
    });

    const form = useForm({
        defaultValues: { targetTemp: 45, duration: 240 },
        validators: { onSubmit: aceDryFormSchema },
        onSubmit: ({ value }) =>
            scheduling
                ? addSchedule.mutateAsync({ ...value, startAt: new Date(startAt).toISOString() }).catch(() => undefined)
                : dry.mutateAsync({ action: 'start', ...value }).catch(() => undefined),
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
                        {presets.length > 0 && (
                            <div className="flex w-full flex-wrap gap-1">
                                {presets.map((p) => (
                                    <button
                                        key={p.name}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                            form.setFieldValue('targetTemp', p.targetTemp);
                                            form.setFieldValue('duration', p.duration);
                                        }}
                                        className="rounded-full bg-background/60 px-3 py-1 text-xs font-medium hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                                        title={`${p.targetTemp} °C · ${formatMinutes(p.duration)}`}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        )}
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
                        {scheduling && (
                            <div className="grid gap-1">
                                <Label className="text-xs text-muted-foreground">{m.ace_schedule_at()}</Label>
                                <Input
                                    type="datetime-local"
                                    className="w-52 rounded-full"
                                    value={startAt}
                                    onChange={(e) => setStartAt(e.target.value)}
                                />
                            </div>
                        )}
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                            {(isSubmitting) => (
                                <div className="flex gap-1">
                                    <Button
                                        type="submit"
                                        size="sm"
                                        className="rounded-full"
                                        disabled={disabled || (busy && !scheduling) || isSubmitting}
                                    >
                                        {scheduling ? m.ace_schedule_confirm() : m.ace_start()}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={scheduling ? 'default' : 'secondary'}
                                        className={cn('rounded-full', scheduling && 'bg-secondary text-foreground')}
                                        title={m.ace_schedule()}
                                        aria-label={m.ace_schedule()}
                                        onClick={() => setScheduling((v) => !v)}
                                    >
                                        {scheduling ? <X /> : <CalendarClock />}
                                    </Button>
                                </div>
                            )}
                        </form.Subscribe>
                    </form>
                )}
                {(schedule.data?.length ?? 0) > 0 && (
                    <ul className="mt-3 space-y-1">
                        {schedule.data?.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center gap-2 rounded-full bg-background/60 px-3 py-1 text-xs"
                            >
                                <CalendarClock className="size-3.5 text-muted-foreground" />
                                <span className="flex-1">
                                    {m.ace_schedule_item({
                                        date: formatDate(s.startAt),
                                        temp: s.targetTemp,
                                        duration: formatMinutes(s.duration),
                                    })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeSchedule.mutate(s.id)}
                                    className="rounded-full p-0.5 hover:bg-background"
                                    aria-label={m.common_delete()}
                                >
                                    <X className="size-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function defaultStart(): string {
    const d = new Date(Date.now() + 60 * 60_000);
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
