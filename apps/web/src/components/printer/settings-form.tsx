import { type PrinterSettingsFormValues, printerSettingsFormSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, type PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';
import { filamentVendorsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useAlertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

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
    onSaved,
    onDeleted,
}: {
    printer: PrinterWithLive;
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
        onSuccess: () => {
            toast.success(m.settings_saved());
            onSaved();
        },
        onError: (e) => toast.error(e.message),
    });
    const connect = useMutation({
        mutationFn: () =>
            printer.live?.manualOffline ? api.printers.connect(printer.id) : api.printers.disconnect(printer.id),
        onSuccess: () => {
            toast.success(printer.live?.manualOffline ? m.printers_reconnect_requested() : m.settings_mqtt_closed());
            onSaved();
        },
        onError: (e) => toast.error(e.message),
    });
    const restart = useMutation({
        mutationFn: () => api.printers.reconnect(printer.id),
        onSuccess: () => toast.success(m.settings_mqtt_restarted()),
        onError: (e) => toast.error(e.message),
    });
    const refresh = useMutation({
        mutationFn: () => api.printers.refreshCredentials(printer.id),
        onSuccess: () => {
            toast.success(m.settings_credentials_refreshed());
            onSaved();
        },
        onError: (e) => toast.error(e.message),
    });
    const openAlertDialog = useAlertConfirmationDialogStore((s) => s.openAlertDialog);
    const remove = useMutation({
        mutationFn: () => api.printers.remove(printer.id),
        onSuccess: () => {
            toast.success(m.settings_printer_deleted());
            onSaved();
            onDeleted();
        },
        onError: (e) => toast.error(e.message),
    });

    const form = useForm({
        defaultValues: {
            name: printer.name,
            ip: printer.ip,
            httpPort: printer.httpPort,
            settings: printer.settings,
        } as z.input<typeof printerSettingsFormSchema>,
        validators: { onSubmit: printerSettingsFormSchema },
        onSubmit: ({ value }) => save.mutateAsync(value).catch(() => undefined),
    });

    return (
        <form
            className="max-w-2xl space-y-4"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <h2 className="px-2 text-xl font-medium">{m.settings_title({ name: printer.name })}</h2>

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
                    <div className="grid gap-4 sm:grid-cols-2">
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
                            disabled={restart.isPending || printer.live?.manualOffline}
                        >
                            {m.settings_restart_mqtt()}
                        </Button>
                        <Button
                            type="button"
                            variant={printer.live?.manualOffline ? 'default' : 'outline'}
                            size="sm"
                            className="rounded-full"
                            onClick={() => connect.mutate()}
                            disabled={connect.isPending}
                        >
                            {printer.live?.manualOffline ? m.settings_reconnect() : m.settings_disconnect()}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle>{m.settings_print()}</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                    <form.Field name="settings.autoLeveling">
                        {(field) => (
                            <Row label={m.settings_auto_leveling()} hint={m.settings_auto_leveling_hint()}>
                                <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                            </Row>
                        )}
                    </form.Field>
                    <form.Field name="settings.vibrationCompensation">
                        {(field) => (
                            <Row label={m.settings_vibration()}>
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
                    <CardTitle>{m.settings_power()}</CardTitle>
                    <CardDescription>{m.settings_power_hint()}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    {(
                        [
                            [
                                'settings.powerOnUrl',
                                m.settings_power_on_url(),
                                'http://192.168.1.50/cm?cmnd=Power%20On',
                            ],
                            [
                                'settings.powerOffUrl',
                                m.settings_power_off_url(),
                                'http://192.168.1.50/cm?cmnd=Power%20Off',
                            ],
                            [
                                'settings.powerStatusUrl',
                                m.settings_power_status_url(),
                                'http://192.168.1.50/cm?cmnd=Power',
                            ],
                        ] as const
                    ).map(([name, label, placeholder]) => (
                        <form.Field key={name} name={name}>
                            {(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>{label}</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        type="url"
                                        placeholder={placeholder}
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
                    ))}
                </CardContent>
            </Card>

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

            <div className="flex items-center gap-2">
                <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(isSubmitting) => (
                        <Button type="submit" className="rounded-full px-6" disabled={isSubmitting}>
                            {m.common_save()}
                        </Button>
                    )}
                </form.Subscribe>
                <Button
                    type="button"
                    variant="destructive"
                    className="ml-auto rounded-full"
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
