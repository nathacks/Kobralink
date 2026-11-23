import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { DetectionCard } from '@/components/settings/detection-card';
import { OperatorOnly, settingsKey } from '@/components/settings/settings-form-card';
import { appSettingsQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/settings/detection')({ component: DetectionSettingsPage });

function DetectionSettingsPage() {
    const { data: s } = useSuspenseQuery(appSettingsQuery);
    return (
        <OperatorOnly>
            <DetectionCard key={settingsKey(s, ['failureDetection'])} settings={s} />
        </OperatorOnly>
    );
}
