import { createFileRoute } from '@tanstack/react-router';
import { McpAppsCard } from '@/components/settings/mcp-apps-card';
import { McpCard } from '@/components/settings/mcp-card';
import { McpKeysCard } from '@/components/settings/mcp-keys-card';
import { McpToolsCard } from '@/components/settings/mcp-tools-card';
import { OperatorOnly } from '@/components/settings/settings-form-card';

export const Route = createFileRoute('/_app/settings/mcp')({ component: McpSettingsPage });

function McpSettingsPage() {
    return (
        <div className="min-w-0 space-y-4">
            <McpCard />
            <OperatorOnly>
                <McpKeysCard />
            </OperatorOnly>
            <McpAppsCard />
            <McpToolsCard />
        </div>
    );
}
