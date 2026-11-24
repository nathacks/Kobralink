import { MCP_KEY_CONFIG, type McpAccess } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { ApiKeyList, CopyKeyButton } from '@/components/settings/api-keys-card';
import { mcpCommand, useMcpUrl } from '@/components/settings/mcp-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCanOperate } from '@/hooks/use-role';
import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';

const mcpKeysQueryKey = ['api-keys', MCP_KEY_CONFIG] as const;

async function listMcpKeys() {
    const res = await authClient.apiKey.list({ query: { configId: MCP_KEY_CONFIG } });
    if (res.error) throw new Error(res.error.message ?? res.error.statusText);
    return res.data.apiKeys;
}

function accessLabel(access: unknown): string {
    return access === 'control' ? m.mcp_access_control() : m.mcp_access_read();
}

export function McpKeysCard() {
    const qc = useQueryClient();
    const canOperate = useCanOperate();
    const url = useMcpUrl();
    const keys = useQuery({ queryKey: mcpKeysQueryKey, queryFn: listMcpKeys, enabled: canOperate });
    const [name, setName] = useState('');
    const [access, setAccess] = useState<McpAccess>('read');
    const [created, setCreated] = useState<string | null>(null);
    const refresh = () => void qc.invalidateQueries({ queryKey: mcpKeysQueryKey });

    const create = useMutation({
        mutationFn: async () => {
            const res = await authClient.apiKey.create({
                name: name.trim(),
                configId: MCP_KEY_CONFIG,
                metadata: { access },
            });
            if (res.error) throw new Error(res.error.message ?? res.error.statusText);
            return res.data.key;
        },
        onSuccess: (key) => {
            setName('');
            setCreated(key);
            refresh();
        },
    });

    const remove = useMutation({
        mutationFn: async (keyId: string) => {
            const res = await authClient.apiKey.delete({ keyId, configId: MCP_KEY_CONFIG });
            if (res.error) throw new Error(res.error.message ?? res.error.statusText);
        },
        onSuccess: refresh,
    });

    const secrets = created
        ? [
              { label: m.api_keys_created_key(), value: created },
              { label: m.mcp_commands(), value: mcpCommand(url, created) },
          ]
        : [];

    return (
        <Card className="rounded-3xl">
            <CardHeader>
                <CardTitle>{m.mcp_keys_title()}</CardTitle>
                <CardDescription>{m.mcp_keys_hint()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (name.trim()) create.mutate();
                    }}
                >
                    <div data-setting className="flex min-w-40 flex-col gap-1.5">
                        <Label htmlFor="mcp-key-access">{m.mcp_access()}</Label>
                        <Select value={access} onValueChange={(v) => setAccess(v === 'control' ? 'control' : 'read')}>
                            <SelectTrigger id="mcp-key-access" className="h-9 w-full rounded-full px-4">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="read">{m.mcp_access_read()}</SelectItem>
                                <SelectItem value="control">{m.mcp_access_control()}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div data-setting className="flex min-w-48 flex-1 flex-col gap-1.5">
                        <Label htmlFor="mcp-key-name">{m.api_keys_name()}</Label>
                        <Input
                            id="mcp-key-name"
                            className="rounded-full px-4"
                            value={name}
                            maxLength={32}
                            placeholder={m.mcp_keys_name_placeholder()}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <Button type="submit" className="rounded-full" disabled={!name.trim() || create.isPending}>
                        <KeyRound /> {m.api_keys_create()}
                    </Button>
                    <p className="w-full text-xs text-muted-foreground">
                        {access === 'control' ? m.mcp_access_control_hint() : m.mcp_access_read_hint()}
                    </p>
                </form>
                {keys.data?.length === 0 && <p className="text-sm text-muted-foreground">{m.mcp_keys_empty()}</p>}
                <ApiKeyList
                    keys={keys.data ?? []}
                    badge={(k) => accessLabel((k.metadata as { access?: unknown } | null)?.access)}
                    pending={remove.isPending}
                    onRevoke={(id) => remove.mutateAsync(id)}
                />
            </CardContent>

            <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
                <DialogContent className="rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>{m.api_keys_created_title()}</DialogTitle>
                        <DialogDescription>{m.mcp_keys_created_hint()}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {secrets.map((s) => (
                            <div key={s.label} className="space-y-1">
                                <p className="text-xs text-muted-foreground">{s.label}</p>
                                <div className="flex items-center gap-2">
                                    <code className="block min-w-0 flex-1 break-all rounded-2xl bg-secondary/50 px-4 py-3 font-mono text-sm text-primary-strong">
                                        {s.value}
                                    </code>
                                    <CopyKeyButton value={s.value} copied={m.mcp_copied()} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" className="rounded-full" onClick={() => setCreated(null)}>
                            {m.common_close()}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
