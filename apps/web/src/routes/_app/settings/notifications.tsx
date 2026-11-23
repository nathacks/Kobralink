import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { NotificationsCard } from '@/components/settings/notifications-card';
import { OperatorOnly, settingsKey } from '@/components/settings/settings-form-card';
import { appSettingsQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/settings/notifications')({ component: NotificationsSettingsPage });

function NotificationsSettingsPage() {
    const { data: s } = useSuspenseQuery(appSettingsQuery);
    return (
        <OperatorOnly>
            <NotificationsCard key={settingsKey(s, ['notifications'])} settings={s} />
        </OperatorOnly>
    );
}
