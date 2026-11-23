import { type AppSettings, homeAssistantApiSettingsSchema } from '@kobralink/shared';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { Field, SettingsCard } from './settings-form-card';

export function HaApiCard({ settings }: { settings: AppSettings }) {
    const qc = useQueryClient();
    const save = useSaveSettings(() => void qc.invalidateQueries({ queryKey: ['home-assistant'] }));
    const form = useForm({
        defaultValues: settings.homeAssistant,
        validators: { onSubmit: homeAssistantApiSettingsSchema.required() },
        onSubmit: ({ value, formApi }) =>
            save
                .mutateAsync({ homeAssistant: value })
                .then(() => formApi.reset(value))
                .catch(() => undefined),
    });
    const changed = useStore(form.store, (s) => !s.isDefaultValue);
    const values = useStore(form.store, (s) => s.values);
    const test = useMutation({
        mutationFn: () => api.homeAssistant.test({ url: values.url, token: values.token }),
        onSuccess: (r) => (r.ok ? toast.success(m.ha_api_test_ok()) : toast.error(r.message)),
        onError: (e: Error) => toast.error(e.message),
    });
    return (
        <SettingsCard
            title={m.ha_api_title()}
            description={m.ha_api_hint()}
            onSubmit={() => void form.handleSubmit()}
            changed={changed}
            onDiscard={() => form.reset()}
            submitting={save.isPending}
            extra={
                <Button
                    type="button"
                    variant="secondary"
                    className="rounded-full"
                    disabled={!values.url || !values.token || test.isPending}
                    onClick={() => test.mutate()}
                >
                    <PlugZap /> {m.ha_api_test()}
                </Button>
            }
        >
            <form.Field name="url">
                {(field) => (
                    <Field label={m.ha_api_url()} htmlFor="ha-api-url">
                        <Input
                            id="ha-api-url"
                            type="url"
                            placeholder="http://192.168.1.54:8123"
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
            <form.Field name="token">
                {(field) => (
                    <Field label={m.ha_api_token()} hint={m.ha_api_token_hint()} htmlFor="ha-api-token">
                        <Input
                            id="ha-api-token"
                            type="password"
                            autoComplete="off"
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
        </SettingsCard>
    );
}
