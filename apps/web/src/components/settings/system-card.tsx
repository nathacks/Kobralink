import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Github from '@thesvg/react/github';
import { Download, ExternalLink, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatBytes, formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { backupInfoQuery, systemInfoQuery } from '@/lib/queries';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { SettingsCard, SwitchRow } from './settings-form-card';

const GITHUB_URL = 'https://github.com/NatHacks/Kobralink';

export function SystemCard() {
    const qc = useQueryClient();
    const info = useQuery(systemInfoQuery);
    const backup = useQuery(backupInfoQuery);
    const [withTimelapses, setWithTimelapses] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const check = useMutation({
        mutationFn: api.system.checkUpdate,
        onSuccess: (u) => {
            void qc.invalidateQueries({ queryKey: ['system'] });
            if (!u?.checked) toast.error(m.system_update_check_failed());
            else toast.success(u.available ? m.system_update_available({ version: u.latest }) : m.system_update_none());
        },
        onError: (e) => toast.error(e.message),
    });
    const restore = useMutation({
        mutationFn: api.system.restore,
        onSuccess: () => {
            toast.success(m.system_restore_started());
            setTimeout(() => window.location.reload(), 6000);
        },
        onError: (e) => toast.error(e.message),
    });
    const restart = useMutation({
        mutationFn: api.system.restart,
        onSuccess: () => {
            toast.success(m.system_restarting());
            setTimeout(() => window.location.reload(), 5000);
        },
        onError: (e) => toast.error(e.message),
    });
    const d = info.data;
    return (
        <>
            <SettingsCard title={m.system_title()}>
                {d && (
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <Row k={m.system_version()} v={`Kobralink ${d.version}`} />
                        <Row k={m.system_runtime()} v={`${d.runtime} · ${d.platform}`} />
                        <Row k={m.system_mode()} v={d.packaged} />
                        <Row k={m.system_uptime()} v={formatDuration(d.uptimeSec, { zero: true })} />
                        <Row k={m.system_data_dir()} v={d.dataDir} mono />
                    </dl>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full"
                        disabled={check.isPending}
                        onClick={() => check.mutate()}
                    >
                        <RefreshCw /> {m.system_check_update()}
                    </Button>
                    {d?.update?.available && (
                        <a
                            href={d.update.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        >
                            <ExternalLink className="size-4" />{' '}
                            {m.system_update_available({ version: d.update.latest })}
                        </a>
                    )}
                    <Button asChild variant="outline" className="rounded-full">
                        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                            <Github /> {m.system_github()}
                        </a>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="ml-auto rounded-full"
                        disabled={restart.isPending}
                        onClick={() =>
                            alertConfirmationDialogStore.actions.openAlertDialog({
                                title: m.system_restart_title(),
                                description: m.system_restart_hint(),
                                actionLabel: m.system_restart(),
                                onAction: () => restart.mutateAsync(),
                            })
                        }
                    >
                        <RotateCcw /> {m.system_restart()}
                    </Button>
                </div>
            </SettingsCard>

            <SettingsCard title={m.backup_title()} description={m.backup_hint()}>
                {backup.data && (
                    <p className="text-sm text-muted-foreground">
                        {m.backup_contents({
                            printers: backup.data.printers,
                            files: backup.data.files,
                            jobs: backup.data.jobs,
                            size: formatBytes(backup.data.sizeBytes),
                        })}
                    </p>
                )}
                <SwitchRow
                    label={m.backup_include_timelapses()}
                    hint={m.backup_include_timelapses_hint({ n: backup.data?.timelapses ?? 0 })}
                >
                    <Switch checked={withTimelapses} onCheckedChange={setWithTimelapses} />
                </SwitchRow>
                <div className="flex flex-wrap gap-2">
                    <a
                        href={api.system.backupUrl(withTimelapses)}
                        download
                        className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                        <Download className="size-4" /> {m.backup_download()}
                    </a>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            alertConfirmationDialogStore.actions.openAlertDialog({
                                title: m.backup_restore_title(),
                                description: m.backup_restore_hint({ name: file.name }),
                                actionLabel: m.backup_restore(),
                                onAction: () => restore.mutateAsync(file),
                            });
                        }}
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full"
                        disabled={restore.isPending}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload /> {m.backup_restore()}
                    </Button>
                </div>
            </SettingsCard>
        </>
    );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div className="flex justify-between gap-4">
            <dt className="whitespace-nowrap text-muted-foreground">{k}</dt>
            <dd className={mono ? 'truncate font-mono text-xs' : 'text-right'} title={v}>
                {v}
            </dd>
        </div>
    );
}
