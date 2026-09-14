import { type AppSettings, type FailureDetectionAction, failureDetectionSettingsSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ScanEye, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePrinters } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { m } from '@/lib/i18n';
import { appSettingsQuery, detectionStatusQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { Field, SettingsCard, SwitchRow, useSaveSettings } from './settings-form-card';

const ACTIONS: [FailureDetectionAction, () => string][] = [
    ['notify', m.detection_action_notify],
    ['pause', m.detection_action_pause],
    ['cancel', m.detection_action_cancel],
];

export function DetectionCard({ settings }: { settings: AppSettings }) {
    const qc = useQueryClient();
    const status = useQuery(detectionStatusQuery);
    const printers = usePrinters();
    const save = useSaveSettings();
    const refresh = () => void qc.invalidateQueries({ queryKey: ['detection'] });
    const download = useMutation({
        mutationFn: api.detection.download,
        onSuccess: refresh,
        onError: (e) => toast.error(e.message),
    });
    const cancel = useMutation({ mutationFn: api.detection.cancelDownload, onSuccess: refresh });
    const remove = useMutation({
        mutationFn: api.detection.deleteModel,
        onSuccess: () => {
            refresh();
            void qc.invalidateQueries({ queryKey: appSettingsQuery.queryKey });
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: settings.failureDetection,
        validators: { onSubmit: failureDetectionSettingsSchema.required() },
        onSubmit: ({ value }) => save.mutateAsync({ failureDetection: value }).catch(() => undefined),
    });
    const d = status.data;
    const model = d?.model;
    const ready = model?.state === 'ready';
    const runtimeOk = d?.runtimeAvailable ?? true;
    const watched = Object.entries(d?.printers ?? {}).filter(([, p]) => p.active);

    return (
        <>
            <SettingsCard
                title={
                    <>
                        <ScanEye className="size-5" /> {m.detection_title()}
                    </>
                }
                description={m.detection_hint()}
            >
                {!runtimeOk && (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {m.detection_runtime_missing({ error: d?.runtimeError ?? '' })}
                    </p>
                )}
                <div className="grid gap-3 rounded-2xl bg-secondary/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-medium">{m.detection_model()}</div>
                            <p className="text-xs text-muted-foreground">
                                {!model || model.state === 'missing'
                                    ? m.detection_model_missing()
                                    : model.state === 'downloading'
                                      ? m.detection_model_downloading({
                                            progress: Math.round(model.progress * 100),
                                            done: formatBytes(model.downloadedBytes),
                                            total: model.sizeBytes ? formatBytes(model.sizeBytes) : '?',
                                        })
                                      : model.state === 'ready'
                                        ? m.detection_model_ready({ size: formatBytes(model.sizeBytes) })
                                        : m.detection_model_error({ error: model.error })}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {model?.state === 'downloading' ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="rounded-full"
                                    onClick={() => cancel.mutate()}
                                    disabled={cancel.isPending}
                                >
                                    <X /> {m.detection_download_cancel()}
                                </Button>
                            ) : ready ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full"
                                    disabled={remove.isPending}
                                    onClick={() =>
                                        alertConfirmationDialogStore.actions.openAlertDialog({
                                            title: m.detection_model_delete_title(),
                                            description: m.detection_model_delete_hint(),
                                            actionLabel: m.detection_model_delete(),
                                            onAction: () => remove.mutateAsync(),
                                        })
                                    }
                                >
                                    <Trash2 /> {m.detection_model_delete()}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    className="rounded-full"
                                    onClick={() => download.mutate()}
                                    disabled={download.isPending || !runtimeOk}
                                >
                                    <Download /> {m.detection_download()}
                                </Button>
                            )}
                        </div>
                    </div>
                    {model?.state === 'downloading' && <Progress value={model.progress * 100} />}
                </div>
            </SettingsCard>

            <SettingsCard
                title={m.settings_general()}
                onSubmit={() => void form.handleSubmit()}
                submitting={save.isPending}
            >
                <form.Field name="enabled">
                    {(field) => (
                        <SwitchRow label={m.detection_enabled()} hint={m.detection_enabled_hint()}>
                            <Switch
                                checked={field.state.value}
                                onCheckedChange={field.handleChange}
                                disabled={!ready || !runtimeOk}
                            />
                        </SwitchRow>
                    )}
                </form.Field>
                <form.Field name="action">
                    {(field) => (
                        <SwitchRow label={m.detection_action()} hint={m.detection_action_hint()}>
                            <Select
                                value={field.state.value}
                                onValueChange={(v) => field.handleChange(v as FailureDetectionAction)}
                            >
                                <SelectTrigger className="w-64 rounded-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ACTIONS.map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label()}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </SwitchRow>
                    )}
                </form.Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <form.Field name="sensitivity">
                        {(field) => (
                            <Field
                                label={m.detection_sensitivity()}
                                htmlFor={field.name}
                                hint={m.detection_sensitivity_hint()}
                            >
                                <Input
                                    id={field.name}
                                    type="number"
                                    min={0.5}
                                    max={2}
                                    step={0.1}
                                    value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="w-32 rounded-full px-4"
                                />
                                <FieldError meta={field.state.meta} />
                            </Field>
                        )}
                    </form.Field>
                    <form.Field name="intervalSec">
                        {(field) => (
                            <Field
                                label={m.detection_interval()}
                                htmlFor={field.name}
                                hint={m.detection_interval_hint()}
                            >
                                <Input
                                    id={field.name}
                                    type="number"
                                    min={5}
                                    max={60}
                                    value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="w-32 rounded-full px-4"
                                />
                                <FieldError meta={field.state.meta} />
                            </Field>
                        )}
                    </form.Field>
                </div>
            </SettingsCard>

            <SettingsCard title={m.detection_live_title()}>
                {watched.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{m.detection_live_idle()}</p>
                ) : (
                    <ul className="grid gap-2">
                        {watched.map(([id, p]) => (
                            <li
                                key={id}
                                className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3 text-sm"
                            >
                                <span className="font-medium">{printers.find((x) => x.id === id)?.name ?? id}</span>
                                <span
                                    className={cn('text-xs', p.failing ? 'text-destructive' : 'text-muted-foreground')}
                                >
                                    {m.detection_live_score({
                                        score: Math.round(p.score * 100),
                                        frames: p.frames,
                                        ms: p.lastInferenceMs,
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </SettingsCard>
        </>
    );
}
