import {
    type Printer,
    type PrinterLiveState,
    type PrinterProfile,
    type PrinterSettingsFormValues,
    printerSettingsFormSchema,
    supportsPrintOption,
} from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { SaveBar } from '@/components/form/save-bar';
import { queueModeText } from '@/components/queue/queue-mode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { appSettingsQuery, filamentVendorsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { printersStore } from '@/stores/printers';
import { EnergySensorField, PlugSwitchField } from './plug-fields';
import { PrinterSpecsCard } from './printer-specs-card';
import { ProfileFields } from './profile-fields';

const SLOT_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div>
                <Label>{label}</Label>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            {children}
        </div>
    );
}

export function PrinterSettingsForm({
    printer,
    live,
    onSaved,
    onDeleted,
}: {
    printer: Printer;
    live: Pick<PrinterLiveState, 'manualOffline' | 'features'> | null | undefined;
    onSaved: () => void;
    onDeleted: () => void;
}) {
    const save = useMutation({
        mutationFn: (value: PrinterSettingsFormValues) =>
            api.printers.update(printer.id, {
                name: value.name.trim(),
                ip: value.ip.trim(),
                httpPort: value.httpPort,
                settings: value.settings,
            }),
        onSuccess: (updated) => {
            printersStore.actions.upsertPrinter(updated);
            toast.success(m.settings_saved());
            onSaved();
        },
    });
    const connect = useMutation({
        mutationFn: () =>
            live?.manualOffline ? api.printers.connect(printer.id) : api.printers.disconnect(printer.id),
        onSuccess: () => {
            toast.success(live?.manualOffline ? m.printers_reconnect_requested() : m.settings_mqtt_closed());
            onSaved();
        },
    });
    const restart = useMutation({
        mutationFn: () => api.printers.reconnect(printer.id),
        onSuccess: () => toast.success(m.settings_mqtt_restarted()),
    });
    const refresh = useMutation({
        mutationFn: () => api.printers.refreshCredentials(printer.id),
        onSuccess: () => {
            toast.success(m.settings_credentials_refreshed());
            onSaved();
        },
    });
    const appSettings = useQuery(appSettingsQuery).data;
    const haConfigured = Boolean(appSettings?.homeAssistant?.url && appSettings.homeAssistant.token);
    const openAlertDialog = alertConfirmationDialogStore.actions.openAlertDialog;
    const remove = useMutation({
        mutationFn: () => api.printers.remove(printer.id),
        onSuccess: () => {
            toast.success(m.settings_printer_deleted());
            onSaved();
            onDeleted();
        },
    });

    const form = useForm({
        defaultValues: {
            name: printer.name,
            ip: printer.ip,
            httpPort: printer.httpPort,
            settings: printer.settings,
        } as z.input<typeof printerSettingsFormSchema>,
        validators: { onSubmit: printerSettingsFormSchema },
        onSubmit: ({ value, formApi }) =>
            save
                .mutateAsync(value)
                .then(() => formApi.reset(value))
                .catch(() => undefined),
    });

    return (
        <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <div className="flex flex-wrap items-center gap-3 px-2">
                <Link
                    to="/printers/$printerId"
                    params={{ printerId: printer.id }}
                    className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm hover:bg-accent"
                >
                    <ArrowLeft className="size-4" /> {m.common_back()}
                </Link>
                <h2 className="text-xl font-medium">{m.settings_title({ name: printer.name })}</h2>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
                <Card className="rounded-3xl border-0 shadow-none">
                    <CardHeader>
                        <CardTitle>{m.profile_title()}</CardTitle>
                        <CardDescription>{m.profile_hint()}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form.Field name="settings.profile">
                            {(field) => (
                                <ProfileFields
                                    value={field.state.value as PrinterProfile}
                                    onChange={field.handleChange}
                                    modeId={printer.modeId}
                                />
                            )}
                        </form.Field>
                    </CardContent>
                </Card>
                <PrinterSpecsCard modeId={printer.modeId} />
            </div>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>{m.settings_connection()}</CardTitle>
                    <CardDescription>
                        {m.settings_connection_hint({
                            deviceId: printer.deviceId.slice(0, 8),
                            username: printer.username,
                            model: printer.model,
                        })}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <form.Field name="name">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>{m.field_name()}</Label>
                                <Input
                                    id={field.name}
                                    name={field.name}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="rounded-full px-4"
                                />
                                <FieldError meta={field.state.meta} />
                            </div>
                        )}
                    </form.Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <form.Field name="ip">
                            {(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>{m.field_ip()}</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                        className="rounded-full px-4"
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            )}
                        </form.Field>
                        <form.Field name="httpPort">
                            {(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>{m.settings_moonraker_port()}</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        className="rounded-full px-4"
                                        type="number"
                                        min={1024}
                                        max={65535}
                                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            )}
                        </form.Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-full"
                            onClick={() => refresh.mutate()}
                            disabled={refresh.isPending}
                        >
                            {m.settings_refresh_credentials()}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-full"
                            onClick={() => restart.mutate()}
                            disabled={restart.isPending || live?.manualOffline}
                        >
                            {m.settings_restart_mqtt()}
                        </Button>
                        <Button
                            type="button"
                            variant={live?.manualOffline ? 'default' : 'outline'}
                            size="sm"
                            className="rounded-full"
                            onClick={() => connect.mutate()}
                            disabled={connect.isPending}
                        >
                            {live?.manualOffline ? m.settings_reconnect() : m.settings_disconnect()}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>{m.settings_print()}</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                    {supportsPrintOption(live?.features, 'autoLeveling') && (
                        <form.Field name="settings.autoLeveling">
                            {(field) => (
                                <Row label={m.settings_auto_leveling()} hint={m.settings_auto_leveling_hint()}>
                                    <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                                </Row>
                            )}
                        </form.Field>
                    )}
                    {supportsPrintOption(live?.features, 'vibrationCompensation') && (
                        <form.Field name="settings.vibrationCompensation">
                            {(field) => (
                                <Row label={m.settings_vibration()}>
                                    <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                                </Row>
                            )}
                        </form.Field>
                    )}
                    {supportsPrintOption(live?.features, 'flowCalibration') && (
                        <form.Field name="settings.flowCalibration">
                            {(field) => (
                                <Row label={m.settings_flow_calibration()} hint={m.settings_flow_calibration_hint()}>
                                    <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                                </Row>
                            )}
                        </form.Field>
                    )}
                    <form.Field name="settings.cameraAlwaysOn">
                        {(field) => (
                            <Row label={m.settings_camera_always_on()} hint={m.settings_camera_always_on_hint()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.cameraOnPrint">
                        {(field) => (
                            <Row label={m.settings_camera_on_print()} hint={m.settings_camera_on_print_hint()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.defaultAmsSlot">
                        {(field) => (
                            <Row label={m.settings_default_slot()} hint={m.settings_default_slot_hint()}>
                                <Select
                                    value={String(field.state.value)}
                                    onValueChange={(v) => field.handleChange(v === 'auto' ? 'auto' : Number(v))}
                                >
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">auto</SelectItem>
                                        {SLOT_CHOICES.map((i) => (
                                            <SelectItem key={`slot-${i}`} value={String(i)}>
                                                {m.settings_slot_n({ n: i + 1 })}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.webUploadWarning">
                        {(field) => (
                            <Row label={m.settings_web_upload_warning()} hint={m.settings_web_upload_warning_hint()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.printStartDialog">
                        {(field) => (
                            <Row label={m.settings_print_start_dialog()} hint={m.settings_print_start_dialog_hint()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.queueAutoStart">
                        {(field) => (
                            <Row label={m.settings_queue_auto_start()} hint={m.settings_queue_auto_start_hint()}>
                                <Switch
                                    checked={field.state.value}
                                    aria-label={m.settings_queue_auto_start()}
                                    onCheckedChange={(on) => {
                                        field.handleChange(on);
                                        if (!on) form.setFieldValue('settings.lightTrigger', false);
                                    }}
                                />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.queueBedClearConfirm">
                        {(field) => (
                            <Row label={m.settings_queue_bed_clear()} hint={m.settings_queue_bed_clear_hint()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Subscribe selector={(s) => s.values.settings.queueAutoStart}>
                        {(autoStart) =>
                            autoStart ? (
                                <form.Field name="settings.queueAutoStartDelaySec">
                                    {(field) => (
                                        <Row label={m.settings_queue_delay()} hint={m.settings_queue_delay_hint()}>
                                            <Input
                                                id={field.name}
                                                type="number"
                                                min={0}
                                                max={3600}
                                                step={5}
                                                aria-label={m.settings_queue_delay()}
                                                value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                                aria-invalid={fieldInvalid(field.state.meta)}
                                                className="w-28 shrink-0 rounded-full px-4"
                                            />
                                        </Row>
                                    )}
                                </form.Field>
                            ) : null
                        }
                    </form.Subscribe>
                    <form.Field name="settings.lightTrigger">
                        {(field) => (
                            <Row label={m.settings_light_trigger()} hint={m.settings_light_trigger_hint()}>
                                <Switch
                                    checked={field.state.value}
                                    aria-label={m.settings_light_trigger()}
                                    onCheckedChange={(on) => {
                                        field.handleChange(on);
                                        if (on) form.setFieldValue('settings.queueAutoStart', true);
                                    }}
                                />
                            </Row>
                        )}
                    </form.Field>
                    <form.Subscribe selector={(s) => s.values.settings}>
                        {(settings) => (
                            <p role="note" className="rounded-2xl bg-primary/10 px-4 py-3 text-sm">
                                {queueModeText(settings)}
                            </p>
                        )}
                    </form.Subscribe>
                    <form.Field name="settings.deletePrinterFileAfterPrint">
                        {(field) => (
                            <Row label={m.settings_delete_after_print()} hint={m.settings_delete_after_print_hint()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.pollIntervalSec">
                        {(field) => (
                            <Row label={m.settings_poll_interval()} hint={m.settings_poll_interval_hint()}>
                                <div className="grid gap-1">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={60}
                                        className="w-24"
                                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            </Row>
                        )}
                    </form.Field>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>{m.settings_timelapse()}</CardTitle>
                    <CardDescription>{m.settings_timelapse_hint()}</CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                    <form.Field name="settings.timelapseEnabled">
                        {(field) => (
                            <Row label={m.settings_timelapse_enabled()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.timelapseFps">
                        {(field) => (
                            <Row label={m.settings_timelapse_fps()} hint={m.settings_timelapse_fps_hint()}>
                                <div className="grid gap-1">
                                    <Input
                                        type="number"
                                        min={5}
                                        max={60}
                                        className="w-24"
                                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                        aria-invalid={fieldInvalid(field.state.meta)}
                                    />
                                    <FieldError meta={field.state.meta} />
                                </div>
                            </Row>
                        )}
                    </form.Field>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>{m.settings_failure_detection()}</CardTitle>
                    <CardDescription>{m.settings_failure_detection_hint()}</CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                    <form.Field name="settings.failureDetection">
                        {(field) => (
                            <Row label={m.settings_failure_detection_enabled()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>{m.settings_alerts()}</CardTitle>
                    <CardDescription>{m.settings_alerts_hint()}</CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                    {(
                        [
                            ['settings.alerts.nozzleMaxC', m.settings_alert_nozzle(), 0, 350],
                            ['settings.alerts.bedMaxC', m.settings_alert_bed(), 0, 150],
                            ['settings.alerts.offlineMinutes', m.settings_alert_offline(), 0, 1440],
                            ['settings.alerts.spoolLowG', m.settings_alert_spool(), 0, 1000],
                        ] as const
                    ).map(([name, label, min, max]) => (
                        <form.Field key={name} name={name}>
                            {(field) => (
                                <Row label={label} hint={m.settings_alert_zero_hint()}>
                                    <div className="grid gap-1">
                                        <Input
                                            type="number"
                                            min={min}
                                            max={max}
                                            className="w-24"
                                            value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                            aria-invalid={fieldInvalid(field.state.meta)}
                                        />
                                        <FieldError meta={field.state.meta} />
                                    </div>
                                </Row>
                            )}
                        </form.Field>
                    ))}
                </CardContent>
            </Card>

            {haConfigured && (
                <Card className="rounded-3xl border-0 shadow-none">
                    <CardHeader>
                        <CardTitle>{m.plug_title()}</CardTitle>
                        <CardDescription>{m.plug_hint()}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <form.Field name="settings.plugSwitch">
                            {(field) => <PlugSwitchField value={field.state.value} onChange={field.handleChange} />}
                        </form.Field>
                        <form.Field name="settings.energySensor">
                            {(field) => <EnergySensorField value={field.state.value} onChange={field.handleChange} />}
                        </form.Field>
                    </CardContent>
                </Card>
            )}

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>{m.settings_vendors()}</CardTitle>
                    <CardDescription>{m.settings_vendors_hint()}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form.Field name="settings.visibleVendors">
                        {(field) => <VendorPicker value={field.state.value} onChange={field.handleChange} />}
                    </form.Field>
                </CardContent>
            </Card>

            <form.Subscribe selector={(s) => [!s.isDefaultValue, s.isSubmitting] as const}>
                {([changed, isSubmitting]) => (
                    <SaveBar changed={changed} submitting={isSubmitting} onDiscard={() => form.reset()} />
                )}
            </form.Subscribe>
            <div className="flex justify-end">
                <Button
                    type="button"
                    variant="destructive"
                    className="rounded-full"
                    onClick={() =>
                        openAlertDialog({
                            title: m.settings_delete_title({ name: printer.name }),
                            description: m.settings_delete_hint(),
                            actionLabel: m.common_delete(),
                            onAction: () => remove.mutateAsync(),
                        })
                    }
                >
                    {m.settings_delete_printer()}
                </Button>
            </div>
        </form>
    );
}

function VendorPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    const vendors = useQuery(filamentVendorsQuery);
    if (!vendors.data) return <p className="text-sm text-muted-foreground">{m.common_loading()}</p>;
    const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    return (
        <div className="flex flex-wrap gap-2">
            {vendors.data.map((v) => {
                const on = value.includes(v);
                return (
                    <button
                        type="button"
                        key={v}
                        onClick={() => toggle(v)}
                        aria-pressed={on}
                        className={cn(
                            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                            on
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {v}
                    </button>
                );
            })}
            {value.length > 0 && (
                <button
                    type="button"
                    onClick={() => onChange([])}
                    className="rounded-full px-3 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                    {m.settings_show_all()}
                </button>
            )}
        </div>
    );
}
