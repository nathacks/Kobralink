import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSaveSettings } from '@/components/settings/settings-form-card';
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
import { usePrinters } from '@/hooks/use-printers';
import { useCanOperate, useIsAdmin } from '@/hooks/use-role';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

const apiKeysQueryKey = ['api-keys'] as const;

interface CreatedKey {
    key: string;
    url: string;
    printerName: string;
}

function printerIdOf(metadata: unknown): string | null {
    const id = (metadata as { printerId?: unknown } | null)?.printerId;
    return typeof id === 'string' ? id : null;
}

async function listKeys() {
    const res = await authClient.apiKey.list();
    if (res.error) throw new Error(res.error.message ?? res.error.statusText);
    return res.data.apiKeys;
}

function CopyKeyButton({ value }: { value: string }) {
    const [done, setDone] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            toast.success(m.slicer_keys_copied());
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

export function ApiKeysCard() {
    const qc = useQueryClient();
    const canOperate = useCanOperate();
    const isAdmin = useIsAdmin();
    const settings = useQuery(appSettingsQuery);
    const save = useSaveSettings();
    const keys = useQuery({ queryKey: apiKeysQueryKey, queryFn: listKeys, enabled: canOperate });
    const printers = usePrinters();
    const [primary] = useHosts();
    const [name, setName] = useState('');
    const [printerId, setPrinterId] = useState('');
    const [created, setCreated] = useState<CreatedKey | null>(null);
    const selected = printers.find((p) => p.id === printerId) ?? null;
    const printerName = (id: string | null) =>
        printers.find((p) => p.id === id)?.name ?? m.slicer_keys_unknown_printer();

    const create = useMutation({
        mutationFn: async (input: { name: string; printerId: string }) => {
            const res = await authClient.apiKey.create({ name: input.name, metadata: { printerId: input.printerId } });
            if (res.error) throw new Error(res.error.message ?? res.error.statusText);
            return res.data;
        },
        onSuccess: (data) => {
            setName('');
            setCreated({
                key: data.key,
                url: `http://${primary}:${selected?.httpPort ?? 7125}`,
                printerName: selected?.name ?? '',
            });
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
        onError: (e) => toast.error(e.message),
    });

    const required = settings.data?.moonrakerApiKey ?? false;

    return (
        <Card className="rounded-3xl">
            <CardHeader>
                <CardTitle>{m.slicer_keys_title()}</CardTitle>
                <CardDescription>{m.slicer_keys_hint()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-secondary/50 px-4 py-3">
                    <div>
                        <div className="text-sm font-medium">{m.slicer_keys_require()}</div>
                        <p className="text-xs text-muted-foreground">{m.slicer_keys_require_hint()}</p>
                    </div>
                    <Switch
                        checked={required}
                        disabled={!isAdmin || save.isPending || settings.isPending}
                        onCheckedChange={(v) => save.mutate({ moonrakerApiKey: v })}
                    />
                </div>

                {canOperate && (
                    <>
                        <form
                            className="flex flex-wrap items-end gap-3"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (name.trim() && printerId) create.mutate({ name: name.trim(), printerId });
                            }}
                        >
                            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                                <Label htmlFor="api-key-printer">{m.slicer_keys_printer()}</Label>
                                <Select value={printerId} onValueChange={setPrinterId}>
                                    <SelectTrigger id="api-key-printer" className="h-9 w-full rounded-full px-4">
                                        <SelectValue placeholder={m.slicer_keys_printer_placeholder()} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {printers.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.name} · {m.slicer_port({ port: p.httpPort })}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                                <Label htmlFor="api-key-name">{m.slicer_keys_name()}</Label>
                                <Input
                                    id="api-key-name"
                                    className="rounded-full px-4"
                                    value={name}
                                    maxLength={64}
                                    placeholder={m.slicer_keys_name_placeholder()}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <Button
                                type="submit"
                                className="rounded-full"
                                disabled={!name.trim() || !printerId || create.isPending}
                            >
                                <KeyRound /> {m.slicer_keys_create()}
                            </Button>
                        </form>

                        {keys.data && keys.data.length === 0 && (
                            <p className="text-sm text-muted-foreground">{m.slicer_keys_empty()}</p>
                        )}
                        {keys.data && keys.data.length > 0 && (
                            <ul className="space-y-2">
                                {keys.data.map((k) => (
                                    <li
                                        key={k.id}
                                        className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/50 px-4 py-3"
                                    >
                                        <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                                            <KeyRound className="size-5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-baseline gap-x-3">
                                                <span className="font-medium">{k.name ?? '—'}</span>
                                                <span className="text-xs text-primary">
                                                    {printerName(printerIdOf(k.metadata))}
                                                </span>
                                                <code className="font-mono text-xs text-muted-foreground">
                                                    {k.start ? `${k.start}…` : ''}
                                                </code>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {m.slicer_keys_created_at({ date: formatDate(String(k.createdAt)) })}
                                                {' · '}
                                                {k.lastRequest
                                                    ? m.slicer_keys_last_used({
                                                          date: formatDate(String(k.lastRequest)),
                                                      })
                                                    : m.slicer_keys_never_used()}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="rounded-full text-destructive hover:text-destructive"
                                            disabled={remove.isPending}
                                            onClick={() =>
                                                alertConfirmationDialogStore.actions.openAlertDialog({
                                                    title: m.slicer_keys_delete_title(),
                                                    description: m.slicer_keys_delete_hint(),
                                                    actionLabel: m.slicer_keys_revoke(),
                                                    onAction: () => remove.mutateAsync(k.id),
                                                })
                                            }
                                        >
                                            <Trash2 /> {m.slicer_keys_revoke()}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {required && <p className="text-xs text-muted-foreground">{m.slicer_keys_camera_hint()}</p>}
                    </>
                )}
            </CardContent>

            <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
                <DialogContent className="rounded-3xl">
                    <DialogHeader>
                        <DialogTitle>{m.slicer_keys_created_title()}</DialogTitle>
                        <DialogDescription>
                            {m.slicer_keys_created_hint({ printer: created?.printerName ?? '' })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">{m.slicer_keys_created_host()}</p>
                            <div className="flex items-center gap-2">
                                <code className="block min-w-0 flex-1 truncate rounded-2xl bg-secondary/50 px-4 py-3 font-mono text-sm">
                                    {created?.url}
                                </code>
                                {created && <CopyKeyButton value={created.url} />}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">{m.slicer_keys_created_key()}</p>
                            <div className="flex items-center gap-2">
                                <code className="block min-w-0 flex-1 break-all rounded-2xl bg-secondary/50 px-4 py-3 font-mono text-sm text-primary">
                                    {created?.key}
                                </code>
                                {created && <CopyKeyButton value={created.key} />}
                            </div>
                        </div>
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
