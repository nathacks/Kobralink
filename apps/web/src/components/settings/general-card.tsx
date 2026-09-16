import type { AppSettings } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { LOCALE_LABEL, m } from '@/lib/i18n';
import { SettingsCard, SwitchRow } from './settings-form-card';

export function GeneralCard({ settings }: { settings: AppSettings }) {
    const save = useSaveSettings();
    const form = useForm({
        defaultValues: {
            locale: settings.locale,
            updateCheck: settings.updateCheck,
            verboseHttpLog: settings.verboseHttpLog,
            currency: settings.currency,
            filamentPricePerKg: settings.filamentPricePerKg,
        },
        onSubmit: ({ value }) => save.mutateAsync(value).catch(() => undefined),
    });
    return (
        <SettingsCard
            title={m.settings_general()}
            onSubmit={() => void form.handleSubmit()}
            submitting={save.isPending}
        >
            <form.Field name="locale">
                {(field) => (
                    <SwitchRow label={m.settings_server_locale()} hint={m.settings_server_locale_hint()}>
                        <Select value={field.state.value} onValueChange={(v) => field.handleChange(v as 'fr' | 'en')}>
                            <SelectTrigger className="w-40 rounded-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(['fr', 'en'] as const).map((l) => (
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
