import { APP_LOCALES, type AppLocale, type AppSettings, optionalUrl } from '@kobralink/shared';
import { useForm, useStore } from '@tanstack/react-form';
import { z } from 'zod';
import { FieldError } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { LOCALE_LABEL, m } from '@/lib/i18n';
import { SettingsCard, SwitchRow } from './settings-form-card';

export const GENERAL_KEYS = [
    'locale',
    'updateCheck',
    'verboseHttpLog',
    'currency',
    'filamentPricePerKg',
    'publicUrl',
] as const satisfies readonly (keyof AppSettings)[];

const generalSchema = z.object({
    locale: z.enum(APP_LOCALES),
    updateCheck: z.boolean(),
    verboseHttpLog: z.boolean(),
    currency: z.string().trim().min(1).max(8),
    filamentPricePerKg: z.number().min(0),
    publicUrl: optionalUrl,
});

export function GeneralCard({ settings }: { settings: AppSettings }) {
    const save = useSaveSettings();
    const form = useForm({
        defaultValues: {
            locale: settings.locale,
            updateCheck: settings.updateCheck,
            verboseHttpLog: settings.verboseHttpLog,
            currency: settings.currency,
            filamentPricePerKg: settings.filamentPricePerKg,
            publicUrl: settings.publicUrl,
        },
        validators: { onSubmit: generalSchema },
        onSubmit: ({ value, formApi }) =>
            save
                .mutateAsync(value)
                .then(() => formApi.reset(value))
                .catch(() => undefined),
    });
    const changed = useStore(form.store, (s) => !s.isDefaultValue);
    return (
        <SettingsCard
            title={m.settings_general()}
            onSubmit={() => void form.handleSubmit()}
            changed={changed}
            onDiscard={() => form.reset()}
            submitting={save.isPending}
        >
            <form.Field name="locale">
                {(field) => (
                    <SwitchRow label={m.settings_server_locale()} hint={m.settings_server_locale_hint()}>
                        <Select value={field.state.value} onValueChange={(v) => field.handleChange(v as AppLocale)}>
                            <SelectTrigger className="w-40 rounded-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {APP_LOCALES.map((l) => (
                                    <SelectItem key={l} value={l}>
                                        {LOCALE_LABEL[l]()}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </SwitchRow>
                )}
            </form.Field>
            <form.Field name="updateCheck">
                {(field) => (
                    <SwitchRow label={m.settings_update_check()} hint={m.settings_update_check_hint()}>
                        <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                    </SwitchRow>
                )}
            </form.Field>
            <form.Field name="currency">
                {(field) => (
                    <SwitchRow label={m.settings_currency()} hint={m.settings_currency_hint()}>
                        <Input
                            value={field.state.value}
                            maxLength={8}
                            onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                            className="w-28 rounded-full px-4 font-mono uppercase"
                        />
                    </SwitchRow>
                )}
            </form.Field>
            <form.Field name="filamentPricePerKg">
                {(field) => (
                    <SwitchRow label={m.settings_filament_price()} hint={m.settings_filament_price_hint()}>
                        <Input
                            type="number"
                            min={0}
                            step={0.5}
                            value={Number.isNaN(field.state.value) ? '' : field.state.value}
                            onChange={(e) => field.handleChange(e.target.valueAsNumber || 0)}
                            className="w-28 rounded-full px-4"
                        />
                    </SwitchRow>
                )}
            </form.Field>
            <form.Field name="publicUrl">
                {(field) => (
                    <div className="grid gap-2 py-1">
                        <label htmlFor="public-url" className="text-sm font-medium">
                            {m.settings_public_url()}
                        </label>
                        <p className="text-xs text-muted-foreground">{m.settings_public_url_hint()}</p>
                        <div className="flex flex-wrap gap-2">
                            <Input
                                id="public-url"
                                value={field.state.value}
                                placeholder={window.location.origin}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value.trim())}
                                className="min-w-0 flex-1 rounded-full px-4"
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                className="rounded-full"
                                onClick={() => field.handleChange(window.location.origin)}
                            >
                                {m.settings_public_url_current()}
                            </Button>
                        </div>
                        <FieldError meta={field.state.meta} />
                    </div>
                )}
            </form.Field>
            <form.Field name="verboseHttpLog">
                {(field) => (
                    <SwitchRow label={m.settings_verbose_http()} hint={m.settings_verbose_http_hint()}>
                        <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
                    </SwitchRow>
                )}
            </form.Field>
        </SettingsCard>
    );
}
