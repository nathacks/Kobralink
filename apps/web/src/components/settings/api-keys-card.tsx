import { type ApiKeyUse, apiKeyMetadata, MCP_PATH, type McpAccess } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { mcpCommand, useApiUrl } from '@/components/settings/mcp-card';
import { SwitchRow } from '@/components/settings/settings-form-card';
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
import { Switch } from '@/components/ui/switch';
import { useHosts } from '@/hooks/use-hosts';
import { usePrinterList } from '@/hooks/use-printers';
import { useCanOperate, useIsAdmin } from '@/hooks/use-role';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

const apiKeysQueryKey = ['api-keys'] as const;
const ALL = 'all';
export const METRICS_PATH = '/api/v1/metrics';

type McpChoice = 'none' | McpAccess;

async function listKeys() {
    const res = await authClient.apiKey.list();
    if (res.error) throw new Error(res.error.message ?? res.error.statusText);
    return res.data.apiKeys;
}

type ListedKey = Awaited<ReturnType<typeof listKeys>>[number];

export function CopyKeyButton({ value, copied = m.api_keys_copied() }: { value: string; copied?: string }) {
    const [done, setDone] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            toast.success(copied);
            setTimeout(() => setDone(false), 1500);
        } catch (e) {
            toast.error((e as Error).message);
        }
    };
    return (
        <Button size="sm" className="rounded-full" onClick={copy}>
            {done ? <Check /> : <Copy />} {m.slicer_copy()}
        </Button>
    );
}

function useLabel(use: ApiKeyUse): string {
    switch (use) {
        case 'moonraker':
            return 'Moonraker';
        case 'metrics':
            return 'Prometheus';
        case 'mcp_read':
            return `MCP · ${m.mcp_access_read()}`;
        case 'mcp_control':
            return `MCP · ${m.mcp_access_control()}`;
    }
}

export function prometheusScrape(metricsUrl: string, key: string): string {
    const url = new URL(metricsUrl);
    return [
        '- job_name: kobralink',
        `  scheme: ${url.protocol.replace(':', '')}`,
        `  metrics_path: ${url.pathname}`,
        '  authorization:',
        `    credentials: ${key}`,
        '  static_configs:',
        `    - targets: ['${url.host}']`,
    ].join('\n');
}

function ApiKeyList({
    keys,
    badge,
    pending,
    onRevoke,
}: {
    keys: ListedKey[];
    badge: (key: ListedKey) => string;
    pending: boolean;
    onRevoke: (id: string) => Promise<unknown>;
}) {
    if (keys.length === 0) return null;
    return (
        <ul className="space-y-2">
            {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/50 px-4 py-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary-strong">
                        <KeyRound className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3">
                            <span className="font-medium">{k.name ?? '—'}</span>
                            <span className="text-xs text-primary-strong">{badge(k)}</span>
                            <code className="font-mono text-xs text-muted-foreground">
                                {k.start ? `${k.start}…` : ''}
                            </code>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {m.api_keys_created_at({ date: formatDate(String(k.createdAt)) })}
                            {' · '}
                            {k.lastRequest
                                ? m.api_keys_last_used({ date: formatDate(String(k.lastRequest)) })
                                : m.api_keys_never_used()}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-destructive hover:text-destructive"
                        disabled={pending}
                        onClick={() =>
                            alertConfirmationDialogStore.actions.openAlertDialog({
                                title: m.api_keys_delete_title(),
                                description: m.api_keys_delete_hint(),
                                actionLabel: m.api_keys_revoke(),
                                onAction: () => onRevoke(k.id),
                            })
                        }
                    >
                        <Trash2 /> {m.api_keys_revoke()}
                    </Button>
                </li>
            ))}
        </ul>
    );
}

export function ApiKeysLink() {
    return (
        <Button asChild variant="secondary" size="sm" className="rounded-full">
            <Link to="/settings/api-keys">
                <KeyRound /> {m.api_keys_manage()}
            </Link>
        </Button>
    );
}

export function MoonrakerKeyCard() {
    const isAdmin = useIsAdmin();
    const settings = useQuery(appSettingsQuery);
    const save = useSaveSettings();
    const required = settings.data?.moonrakerApiKey ?? false;
    return (
        <Card className="rounded-3xl">
            <CardHeader>
                <CardTitle>{m.slicer_keys_title()}</CardTitle>
                <CardDescription>{m.slicer_keys_hint()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div
                    data-setting
                    className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/50 px-4 py-3"
                >
                    <div>
                        <div className="text-sm font-medium">{m.slicer_keys_require()}</div>
                        <p className="text-xs text-muted-foreground">{m.slicer_keys_require_hint()}</p>
                    </div>
                    <Switch
                        aria-label={m.slicer_keys_require()}
                        checked={required}
                        disabled={!isAdmin || save.isPending || settings.isPending}
                        onCheckedChange={(v) => save.mutate({ moonrakerApiKey: v })}
                    />
                </div>
                {required && <p className="text-xs text-muted-foreground">{m.slicer_keys_camera_hint()}</p>}
                <ApiKeysLink />
            </CardContent>
        </Card>
    );
}

interface Secret {
    label: string;
    value: string;
}

export function ApiKeysCard() {
    const qc = useQueryClient();
    const canOperate = useCanOperate();
    const keys = useQuery({ queryKey: apiKeysQueryKey, queryFn: listKeys, enabled: canOperate });
    const printers = usePrinterList();
    const [primary] = useHosts();
    const mcpUrl = useApiUrl(MCP_PATH);
    const metricsUrl = useApiUrl(METRICS_PATH);
    const [name, setName] = useState('');
    const [printerId, setPrinterId] = useState(ALL);
    const [moonraker, setMoonraker] = useState(false);
    const [metrics, setMetrics] = useState(false);
    const [mcp, setMcp] = useState<McpChoice>('none');
    const [created, setCreated] = useState<Secret[] | null>(null);
    const scope = mcp === 'none' ? printerId : ALL;
    const uses: ApiKeyUse[] = [
        ...(moonraker ? (['moonraker'] as const) : []),
        ...(metrics ? (['metrics'] as const) : []),
        ...(mcp === 'none' ? [] : [`mcp_${mcp}` as const]),
    ];
    const printerName = (id: string | null) =>
        id === null
            ? m.api_keys_scope_all()
            : (printers.find((p) => p.id === id)?.name ?? m.slicer_keys_unknown_printer());

    const create = useMutation({
        mutationFn: async () => {
            const res = await authClient.apiKey.create({
                name: name.trim(),
                metadata: { printerId: scope === ALL ? null : scope, uses },
            });
            if (res.error) throw new Error(res.error.message ?? res.error.statusText);
            return res.data.key;
        },
        onSuccess: (key) => {
            const printer = printers.find((p) => p.id === scope);
            setCreated([
                { label: m.api_keys_created_key(), value: key },
                ...(moonraker && printer
                    ? [{ label: m.slicer_keys_created_host(), value: `http://${primary}:${printer.httpPort}` }]
                    : []),
                ...(mcp !== 'none' && mcpUrl ? [{ label: m.mcp_commands(), value: mcpCommand(mcpUrl, key) }] : []),
                ...(metrics && metricsUrl
                    ? [{ label: m.api_keys_created_scrape(), value: prometheusScrape(metricsUrl, key) }]
                    : []),
            ]);
            setName('');
            void qc.invalidateQueries({ queryKey: apiKeysQueryKey });
        },
        onError: (e) => toast.error(e.message),
    });

    const remove = useMutation({
        mutationFn: async (keyId: string) => {
            const res = await authClient.apiKey.delete({ keyId });
            if (res.error) throw new Error(res.error.message ?? res.error.statusText);
        },
        onSuccess: () => void qc.invalidateQueries({ queryKey: apiKeysQueryKey }),
    });

    return (
        <Card className="rounded-3xl">
            <CardHeader>
                <CardTitle>{m.api_keys_title()}</CardTitle>
                <CardDescription>{m.api_keys_hint()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <form
                    className="space-y-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (name.trim() && uses.length) create.mutate();
                    }}
                >
                    <div className="flex flex-wrap items-end gap-3">
                        <div data-setting className="flex min-w-48 flex-1 flex-col gap-1.5">
                            <Label htmlFor="api-key-name">{m.api_keys_name()}</Label>
                            <Input
                                id="api-key-name"
                                className="rounded-full px-4"
                                value={name}
                                maxLength={64}
                                placeholder={m.api_keys_name_placeholder()}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div data-setting className="flex min-w-48 flex-1 flex-col gap-1.5">
                            <Label htmlFor="api-key-printer">{m.api_keys_scope()}</Label>
                            <Select value={scope} onValueChange={setPrinterId} disabled={mcp !== 'none'}>
                                <SelectTrigger id="api-key-printer" className="h-9 w-full rounded-full px-4">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>{m.api_keys_scope_all()}</SelectItem>
                                    {printers.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name} · {m.slicer_port({ port: p.httpPort })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="rounded-2xl bg-secondary/50 px-4 py-2">
                        <SwitchRow label={m.api_keys_use_moonraker()} hint={m.api_keys_use_moonraker_hint()}>
                            <Switch
                                aria-label={m.api_keys_use_moonraker()}
                                checked={moonraker}
                                onCheckedChange={setMoonraker}
                            />
                        </SwitchRow>
                        <SwitchRow label={m.api_keys_use_metrics()} hint={m.api_keys_use_metrics_hint()}>
                            <Switch
                                aria-label={m.api_keys_use_metrics()}
                                checked={metrics}
                                onCheckedChange={setMetrics}
                            />
                        </SwitchRow>
                        <SwitchRow
                            label={m.api_keys_use_mcp()}
                            hint={
                                mcp === 'none'
                                    ? m.api_keys_use_mcp_hint()
                                    : `${mcp === 'control' ? m.mcp_access_control_hint() : m.mcp_access_read_hint()} ${m.api_keys_use_mcp_hint()}`
                            }
                        >
                            <Select value={mcp} onValueChange={(v) => setMcp(v as McpChoice)}>
                                <SelectTrigger aria-label={m.api_keys_use_mcp()} className="h-9 w-40 rounded-full px-4">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{m.api_keys_use_none()}</SelectItem>
                                    <SelectItem value="read">{m.mcp_access_read()}</SelectItem>
                                    <SelectItem value="control">{m.mcp_access_control()}</SelectItem>
                                </SelectContent>
                            </Select>
                        </SwitchRow>
                    </div>
                    <Button
                        type="submit"
                        className="rounded-full"
                        disabled={!name.trim() || uses.length === 0 || create.isPending}
                    >
                        <KeyRound /> {m.api_keys_create()}
                    </Button>
                </form>

                {keys.data?.length === 0 && <p className="text-sm text-muted-foreground">{m.api_keys_empty()}</p>}
                <ApiKeyList
                    keys={keys.data ?? []}
                    badge={(k) => {
                        const meta = apiKeyMetadata(k.metadata);
                        return [...meta.uses.map(useLabel), printerName(meta.printerId)].join(' · ');
                    }}
                    pending={remove.isPending}
                    onRevoke={(id) => remove.mutateAsync(id)}
                />
            </CardContent>

            <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
                <DialogContent className="rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>{m.api_keys_created_title()}</DialogTitle>
                        <DialogDescription>{m.api_keys_created_hint()}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {created?.map((s) => (
                            <div key={s.label} className="space-y-1">
                                <p className="text-xs text-muted-foreground">{s.label}</p>
                                <div className="flex items-center gap-2">
                                    <code className="block min-w-0 flex-1 whitespace-pre-wrap break-all rounded-2xl bg-secondary/50 px-4 py-3 font-mono text-sm text-primary-strong">
                                        {s.value}
                                    </code>
                                    <CopyKeyButton value={s.value} />
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
