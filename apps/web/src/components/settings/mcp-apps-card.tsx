import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { mcpConnectionsQuery } from '@/lib/queries';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export function McpAppsCard() {
    const qc = useQueryClient();
    const apps = useQuery(mcpConnectionsQuery);
    const disconnect = useMutation({
        mutationFn: (id: string) => api.mcp.disconnect(id),
        onSuccess: () => void qc.invalidateQueries({ queryKey: mcpConnectionsQuery.queryKey }),
    });

    return (
        <Card className="rounded-3xl">
            <CardHeader>
                <CardTitle>{m.mcp_apps_title()}</CardTitle>
                <CardDescription>{m.mcp_apps_hint()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {apps.data?.length === 0 && <p className="text-sm text-muted-foreground">{m.mcp_apps_empty()}</p>}
                {apps.data?.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/50 px-4 py-3">
                        <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary-strong">
                            <Bot className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-3">
                                <span className="font-medium">{a.name}</span>
                                <span className="text-xs text-primary-strong">
                                    {a.access === 'control' ? m.mcp_access_control() : m.mcp_access_read()}
                                </span>
                            </div>
                            <p className="text-xs break-words text-muted-foreground">
                                {a.redirectHosts.join(', ')} · {m.mcp_apps_since({ date: formatDate(a.createdAt) })}
                            </p>
                        </div>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-destructive hover:text-destructive"
                            disabled={disconnect.isPending}
                            onClick={() =>
                                alertConfirmationDialogStore.actions.openAlertDialog({
                                    title: m.mcp_apps_disconnect_title(),
                                    description: m.mcp_apps_disconnect_hint(),
                                    actionLabel: m.mcp_apps_disconnect(),
                                    onAction: () => disconnect.mutateAsync(a.id),
                                })
                            }
                        >
                            <Unplug /> {m.mcp_apps_disconnect()}
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
