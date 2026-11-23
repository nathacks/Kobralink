import { createFileRoute } from '@tanstack/react-router';
import { OperatorOnly } from '@/components/settings/settings-form-card';
import { SystemCard } from '@/components/settings/system-card';

export const Route = createFileRoute('/_app/settings/system')({ component: SystemSettingsPage });

function SystemSettingsPage() {
    return (
        <OperatorOnly>
            <SystemCard />
        </OperatorOnly>
    );
}
