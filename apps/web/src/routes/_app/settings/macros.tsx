import { createFileRoute } from '@tanstack/react-router';
import { MacrosEditor } from '@/components/settings/macros-editor';
import { OperatorOnly } from '@/components/settings/settings-form-card';

export const Route = createFileRoute('/_app/settings/macros')({ component: MacrosSettingsPage });

function MacrosSettingsPage() {
    return (
        <OperatorOnly>
            <MacrosEditor />
        </OperatorOnly>
    );
}
