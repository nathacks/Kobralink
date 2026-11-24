import { MCP_PATH } from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { CopyKeyButton } from '@/components/settings/api-keys-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useHosts } from '@/hooks/use-hosts';
import { useIsAdmin } from '@/hooks/use-role';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { m } from '@/lib/i18n';
import { appSettingsQuery, mcpInfoQuery } from '@/lib/queries';

export function useApiUrl(path: string): string {
    const info = useQuery(mcpInfoQuery);
    const [host] = useHosts();
    if (!info.data) return '';
    const url = new URL(info.data.url);
    return url.protocol === 'https:' ? `${url.origin}${path}` : `http://${host}:${url.port || 80}${path}`;
}

export function useMcpUrl(): string {
    return useApiUrl(MCP_PATH);
}

export function mcpCommand(url: string, key: string): string {
    return `claude mcp add --transport http kobralink ${url} --header "Authorization: Bearer ${key}"`;
}

export function McpCard() {
    const isAdmin = useIsAdmin();
    const settings = useQuery(appSettingsQuery);
    const info = useQuery(mcpInfoQuery);
    const save = useSaveSettings();
    const url = useMcpUrl();
    const oauthHint = !info.data?.oauth
        ? m.mcp_oauth_off()
        : info.data.url.startsWith('https:')
          ? m.mcp_oauth_on()
          : m.mcp_oauth_local();

    return (
        <Card className="rounded-3xl">
            <CardHeader>
                <CardTitle>{m.mcp_title()}</CardTitle>
                <CardDescription>{m.mcp_hint()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div
                    data-setting
                    className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/50 px-4 py-3"
                >
                    <div>
                        <div className="text-sm font-medium">{m.mcp_enable()}</div>
                        <p className="text-xs text-muted-foreground">{m.mcp_enable_hint()}</p>
                    </div>
                    <Switch
                        aria-label={m.mcp_enable()}
                        checked={settings.data?.mcpEnabled ?? false}
                        disabled={!isAdmin || save.isPending || settings.isPending}
                        onCheckedChange={(v) => save.mutate({ mcpEnabled: v })}
                    />
                </div>
                <div data-setting className="space-y-1">
                    <p className="text-xs text-muted-foreground">{m.mcp_url()}</p>
                    <div className="flex items-center gap-2">
                        <code className="block min-w-0 flex-1 truncate rounded-2xl bg-secondary/50 px-4 py-3 font-mono text-sm">
                            {url}
                        </code>
                        <CopyKeyButton value={url} copied={m.mcp_copied()} />
                    </div>
                    {info.data && <p className="text-xs text-muted-foreground">{oauthHint}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
