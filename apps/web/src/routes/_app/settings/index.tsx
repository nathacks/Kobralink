import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import {
    LEGACY_SETTINGS_TABS,
    type LegacySettingsTab,
    legacySettingsPath,
} from '@/components/settings/settings-sections';

const legacyTab = z.enum(Object.keys(LEGACY_SETTINGS_TABS) as [LegacySettingsTab]);

export const Route = createFileRoute('/_app/settings/')({
    validateSearch: z.object({ tab: legacyTab.optional().catch(undefined) }),
    beforeLoad: ({ search }) => {
        throw redirect({ to: legacySettingsPath(search.tab), replace: true });
    },
});
