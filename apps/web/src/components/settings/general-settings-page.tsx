import { useSuspenseQuery } from '@tanstack/react-query';
import { AppearanceCard } from '@/components/settings/appearance-card';
import { COSTS_KEYS, CostsCard } from '@/components/settings/costs-card';
import { GENERAL_KEYS, GeneralCard } from '@/components/settings/general-card';
import { OperatorOnly, settingsKey } from '@/components/settings/settings-form-card';
import { appSettingsQuery } from '@/lib/queries';

export function GeneralSettingsPage() {
    const { data: s } = useSuspenseQuery(appSettingsQuery);
    return (
        <>
            <AppearanceCard />
            <OperatorOnly>
                <GeneralCard key={settingsKey(s, GENERAL_KEYS)} settings={s} />
                <CostsCard key={settingsKey(s, COSTS_KEYS)} settings={s} />
            </OperatorOnly>
        </>
    );
}
