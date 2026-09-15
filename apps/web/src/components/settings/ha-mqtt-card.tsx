import { type AppSettings, haMqttSettingsSchema } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { m } from '@/lib/i18n';
import { Field, SettingsCard, SwitchRow } from './settings-form-card';

export function HaMqttCard({ settings }: { settings: AppSettings }) {
    const save = useSaveSettings();
    const form = useForm({
        defaultValues: settings.haMqtt,
        validators: { onSubmit: haMqttSettingsSchema.required() },
        onSubmit: ({ value }) => save.mutateAsync({ haMqtt: value }).catch(() => undefined),
    });
    const text = (
        name: 'url' | 'username' | 'password' | 'discoveryPrefix' | 'topicPrefix',
        label: string,
        placeholder: string,
        type = 'text',
    ) => (
        <form.Field name={name}>
            {(field) => (
                <Field label={label} htmlFor={`ha-${field.name}`}>
                    <Input
                        id={`ha-${field.name}`}
                        type={type}
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
            title="Home Assistant (MQTT)"
            description={m.ha_hint()}
            onSubmit={() => void form.handleSubmit()}
            submitting={save.isPending}
        >
            <form.Field name="enabled">
                {(field) => (
                    <SwitchRow label={m.ha_enabled()}>
                        <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                    </SwitchRow>
                )}
            </form.Field>
            {text('url', m.ha_url(), 'mqtt://192.168.1.10:1883')}
            <div className="grid gap-4 sm:grid-cols-2">
                {text('username', m.ha_username(), '')}
                {text('password', m.ha_password(), '', 'password')}
                {text('discoveryPrefix', m.ha_discovery_prefix(), 'homeassistant')}
                {text('topicPrefix', m.ha_topic_prefix(), 'kobralink')}
            </div>
        </SettingsCard>
    );
}
