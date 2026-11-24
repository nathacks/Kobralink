import type { AppSettings } from '@kobralink/shared';
import { useForm, useSelector } from '@tanstack/react-form';
import { Input } from '@/components/ui/input';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { m } from '@/lib/i18n';
import { SettingsCard, SwitchRow } from './settings-form-card';

type CostField = 'energyPricePerKwh' | 'printerPowerW';

export const COSTS_KEYS = ['costs'] as const satisfies readonly (keyof AppSettings)[];

export function CostsCard({ settings }: { settings: AppSettings }) {
    const save = useSaveSettings();
    const form = useForm({
        defaultValues: {
            energyPricePerKwh: settings.costs.energyPricePerKwh,
            printerPowerW: settings.costs.printerPowerW,
        },
        onSubmit: ({ value, formApi }) =>
            save
                .mutateAsync({ costs: value })
                .then(() => formApi.reset(value))
                .catch(() => undefined),
    });
    const changed = useSelector(form.store, (s) => !s.isDefaultValue);
    const num = (name: CostField, label: string, hint: string, step: number, id: string) => (
        <form.Field name={name}>
            {(field) => (
                <SwitchRow label={label} hint={hint}>
                    <Input
                        id={id}
                        aria-label={label}
                        type="number"
                        min={0}
                        step={step}
                        value={Number.isNaN(field.state.value) ? '' : field.state.value}
                        onChange={(e) => field.handleChange(e.target.valueAsNumber || 0)}
                        className="w-28 rounded-full px-4"
                    />
                </SwitchRow>
            )}
        </form.Field>
    );
    return (
        <SettingsCard
            title={m.settings_costs()}
            description={m.settings_costs_hint({ currency: settings.currency })}
            onSubmit={() => void form.handleSubmit()}
            changed={changed}
            onDiscard={() => form.reset()}
            submitting={save.isPending}
        >
            {num('energyPricePerKwh', m.settings_energy_price(), m.settings_energy_price_hint(), 0.01, 'cost-energy')}
            {num('printerPowerW', m.settings_printer_power(), m.settings_printer_power_hint(), 5, 'cost-power')}
        </SettingsCard>
    );
}
