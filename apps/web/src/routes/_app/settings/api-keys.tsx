import { createFileRoute } from '@tanstack/react-router';
import { ApiKeysCard } from '@/components/settings/api-keys-card';
import { OperatorOnly } from '@/components/settings/settings-form-card';

export const Route = createFileRoute('/_app/settings/api-keys')({ component: ApiKeysPage });

function ApiKeysPage() {
    return (
        <div className="min-w-0 space-y-4">
            <OperatorOnly>
                <ApiKeysCard />
            </OperatorOnly>
        </div>
    );
}
