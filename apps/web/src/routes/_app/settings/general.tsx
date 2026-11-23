import { createFileRoute } from '@tanstack/react-router';
import { GeneralSettingsPage } from '@/components/settings/general-settings-page';

export const Route = createFileRoute('/_app/settings/general')({ component: GeneralSettingsPage });
