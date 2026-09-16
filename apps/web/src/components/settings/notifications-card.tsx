import { type AppSettings, notificationEventsSchema, notificationSettingsSchema, optionalUrl } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { Field, SettingsCard, SwitchRow } from './settings-form-card';

const schema = notificationSettingsSchema.required().extend({
    events: notificationEventsSchema.required(),
    webhookUrl: optionalUrl,
    discordUrl: optionalUrl,
    ntfyUrl: optionalUrl,
});

const EVENT_LABELS: [keyof AppSettings['notifications']['events'], () => string][] = [
    ['printStarted', m.notif_ev_print_started],
    ['printFinished', m.notif_ev_print_finished],
    ['printCancelled', m.notif_ev_print_cancelled],
    ['printPaused', m.notif_ev_print_paused],
    ['printerOffline', m.notif_ev_printer_offline],
    ['printerOnline', m.notif_ev_printer_online],
    ['dryingDone', m.notif_ev_drying_done],
    ['queueNext', m.notif_ev_queue_next],
    ['alerts', m.notif_ev_alerts],
    ['printFailure', m.notif_ev_print_failure],
];

export function NotificationsCard({ settings }: { settings: AppSettings }) {
    const save = useSaveSettings();
    const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() =>
        'Notification' in window ? Notification.permission : 'unsupported',
    );
    const test = useMutation({
        mutationFn: api.events.test,
        onSuccess: (r) => {
            if (r.failed.length) toast.error(r.failed.map((f) => `${f.channel}: ${f.error}`).join(' · '));
            else toast.success(m.notif_test_ok({ channels: r.delivered.join(', ') || '—' }));
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(m.notify_test_title(), { body: m.notify_test_body() });
            }
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: settings.notifications,
        validators: { onSubmit: schema },
        onSubmit: ({ value }) => save.mutateAsync({ notifications: value }).catch(() => undefined),
    });
    const text = (
        name: 'webhookUrl' | 'discordUrl' | 'telegramToken' | 'telegramChatId' | 'ntfyUrl',
        label: string,
        placeholder: string,
        hint?: string,
    ) => (
        <form.Field name={name}>
            {(field) => (
                <Field label={label} htmlFor={field.name} hint={hint}>
                    <Input
                        id={field.name}
                        placeholder={placeholder}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={fieldInvalid(field.state.meta)}
                        className="rounded-full px-4"
                    />
                    <FieldError meta={field.state.meta} />
                </Field>
            )}
        </form.Field>
    );
    return (
        <SettingsCard
            title={m.notif_title()}
            description={m.notif_hint()}
            onSubmit={() => void form.handleSubmit()}
            submitting={save.isPending}
            extra={
                <Button
                    type="button"
                    variant="secondary"
                    className="rounded-full"
                    disabled={test.isPending}
                    onClick={() => test.mutate()}
                >
                    <BellRing /> {m.notif_test()}
                </Button>
            }
        >
            <form.Field name="browser">
                {(field) => (
                    <SwitchRow
                        label={m.notif_browser()}
                        hint={
                            perm === 'unsupported'
                                ? m.notif_browser_unsupported()
                                : perm === 'denied'
                                  ? m.notif_browser_denied()
                                  : perm === 'default'
                                    ? m.notif_browser_ask()
                                    : m.notif_browser_hint()
                        }
                    >
                        <div className="flex items-center gap-2">
                            {perm === 'default' && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="rounded-full"
                                    onClick={() => Notification.requestPermission().then(setPerm)}
                                >
                                    {m.notif_browser_allow()}
                                </Button>
                            )}
                            <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                        </div>
                    </SwitchRow>
                )}
            </form.Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {text('discordUrl', 'Discord', 'https://discord.com/api/webhooks/…', m.notif_discord_hint())}
                {text('ntfyUrl', 'ntfy', 'https://ntfy.sh/kobralink', m.notif_ntfy_hint())}
                {text('telegramToken', m.notif_telegram_token(), '123456:ABC-DEF…')}
                {text('telegramChatId', m.notif_telegram_chat(), '-1001234567890')}
            </div>
            {text('webhookUrl', m.notif_webhook(), 'https://…', m.notif_webhook_hint())}
            <div>
                <div className="mb-2 text-sm font-medium">{m.notif_events()}</div>
                <div className="grid gap-x-6 sm:grid-cols-2">
                    {EVENT_LABELS.map(([key, label]) => (
                        <form.Field key={key} name={`events.${key}`}>
                            {(field) => (
                                <SwitchRow label={label()}>
                                    <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                                </SwitchRow>
                            )}
                        </form.Field>
                    ))}
                </div>
            </div>
        </SettingsCard>
    );
}
