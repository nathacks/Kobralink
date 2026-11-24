import { createFileRoute } from '@tanstack/react-router';
import { ApiKeysLink } from '@/components/settings/api-keys-card';
import { McpAppsCard } from '@/components/settings/mcp-apps-card';
import { McpCard } from '@/components/settings/mcp-card';
import { McpToolsCard } from '@/components/settings/mcp-tools-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { m } from '@/lib/i18n';

export const Route = createFileRoute('/_app/settings/mcp')({ component: McpSettingsPage });

function McpSettingsPage() {
    return (
        <div className="min-w-0 space-y-4">
            <McpCard />
            <Card className="rounded-3xl">
                <CardHeader>
                    <CardTitle>{m.api_keys_title()}</CardTitle>
                    <CardDescription>{m.mcp_keys_hint()}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ApiKeysLink />
                </CardContent>
            </Card>
            <McpAppsCard />
            <McpToolsCard />
        </div>
    );
}
