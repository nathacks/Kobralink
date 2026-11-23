import { createFileRoute } from '@tanstack/react-router';
import { FilamentPage } from '@/components/filament/filament-page';
import { appSettingsQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/filament')({
    loader: ({ context }) => context.queryClient.ensureQueryData(appSettingsQuery),
    component: FilamentPage,
});
