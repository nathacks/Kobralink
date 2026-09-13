import type { GcodeFileDto, PrinterLiveState, PrintJobDto } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Play, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';
import { filesQuery, historyQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Tab = 'files' | 'web' | 'history';

export function FilesCard({ printerId, state }: { printerId: string; state: PrinterLiveState }) {
    const qc = useQueryClient();
    const files = useQuery(filesQuery(printerId));
    const jobs = useQuery(historyQuery(printerId));
    const inputRef = useRef<HTMLInputElement>(null);
    const [tab, setTab] = useState<Tab>('files');
    const busy = state.printState === 'printing' || state.printState === 'paused';
    const canPrint = state.connected && !busy;

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'files'] });
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'history'] });
    };
    const upload = useMutation({
        mutationFn: (file: File) => api.files.upload(printerId, file, false),
        onSuccess: (f) => {
            toast.success(`${f.filename} ajouté`);
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });
    const print = useMutation({
        mutationFn: (fileId: string) => api.files.print(printerId, { fileId }),
        onSuccess: (f) => {
            toast.success(`Impression lancée : ${f.filename}`);
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });
    const remove = useMutation({
        mutationFn: (fileId: string) => api.files.remove(printerId, fileId),
        onSuccess: invalidate,
        onError: (e) => toast.error(e.message),
    });

    const list = (files.data ?? []).filter((f) => (tab === 'web' ? f.webUnverified : true));
    const webCount = files.data?.filter((f) => f.webUnverified).length ?? 0;

    return (
        <section className="flex flex-col rounded-3xl bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-medium">Fichiers</h2>
                <span className="text-sm text-muted-foreground">
                    {files.data
                        ? `${files.data.length} fichier${files.data.length > 1 ? 's' : ''} stocké${files.data.length > 1 ? 's' : ''}`
                        : ''}
                </span>
            </div>
            <div className="mt-4 flex w-fit gap-1 rounded-full bg-secondary p-1">
                <TabButton active={tab === 'files'} onClick={() => setTab('files')}>
                    Tous
                </TabButton>
                <TabButton active={tab === 'web'} onClick={() => setTab('web')}>
                    Web{webCount ? ` · ${webCount}` : ''}
                </TabButton>
                <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
                    Historique
                </TabButton>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept=".gcode,.bgcode"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) upload.mutate(file);
                }}
            />

            {tab === 'history' ? (
                <HistoryList jobs={jobs.data ?? []} />
            ) : (
                <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                    {list.map((f, i) => (
                        <FileTile
                            key={f.id}
                            file={f}
                            printerId={printerId}
                            highlight={i === 0 && !!f.lastJob && f.lastJob.status === 'printing'}
                            canPrint={canPrint && !print.isPending}
                            onPrint={() => print.mutate(f.id)}
                            onDelete={() => {
                                if (window.confirm(`Supprimer ${f.filename} ?`)) remove.mutate(f.id);
                            }}
                        />
                    ))}
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={upload.isPending}
                        className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-primary/40 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                    >
                        <Plus className="size-6" />
                        {upload.isPending ? 'Envoi…' : 'Ajouter un GCode'}
                    </button>
                </div>
            )}
        </section>
    );
}

function TabButton({ active, ...props }: React.ComponentProps<'button'> & { active: boolean }) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
        />
    );
}

function FileTile({
    file,
    printerId,
    highlight,
    canPrint,
    onPrint,
    onDelete,
}: {
    file: GcodeFileDto;
    printerId: string;
    highlight: boolean;
    canPrint: boolean;
    onPrint: () => void;
    onDelete: () => void;
}) {
    return (
        <div
            className={cn(
                'group flex min-h-44 flex-col rounded-3xl p-4',
                highlight ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-background/40">
                    {file.thumbnail ? (
                        <img
                            src={`data:image/png;base64,${file.thumbnail}`}
                            alt=""
                            className="size-full object-contain"
                        />
                    ) : (
                        <span className="text-[10px] text-muted-foreground">GCode</span>
                    )}
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton title="Télécharger" asChild>
                        <a href={api.files.downloadUrl(printerId, file.id)} download>
                            <Download />
                        </a>
                    </IconButton>
                    <IconButton title="Supprimer" onClick={onDelete}>
                        <Trash2 />
                    </IconButton>
                </div>
            </div>
            <div className="mt-auto space-y-1 pt-4">
                <div className="flex items-center gap-1">
                    {file.filaments
                        .filter((f) => f.isUsed)
                        .map((f) => (
                            <span
                                key={f.slotIndex}
                                className="inline-block size-2.5 rounded-full ring-1 ring-black/10"
                                style={{ background: f.colorHex }}
                                title={`${f.material} (T${f.slotIndex})`}
                            />
                        ))}
                    {file.lastJob && (
                        <span
                            className={cn(
                                'ml-auto text-[11px]',
                                highlight ? 'text-primary-foreground/80' : 'text-muted-foreground',
                            )}
                        >
                            {file.lastJob.status === 'completed'
                                ? 'Terminé'
                                : file.lastJob.status === 'printing'
                                  ? 'En cours'
                                  : 'Annulé'}
                        </span>
                    )}
                </div>
                <div className="truncate font-medium" title={file.filename}>
                    {file.filename}
                </div>
                <div
                    className={cn(
                        'flex items-center justify-between text-xs',
                        highlight ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                >
                    <span>
                        {formatDuration(file.estPrintTimeSec)} · {formatBytes(file.sizeBytes)}
                    </span>
                    <button
                        type="button"
                        onClick={onPrint}
                        disabled={!canPrint}
                        title="Imprimer"
                        aria-label="Imprimer"
                        className={cn(
                            'flex size-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 [&_svg]:size-3.5',
                            highlight
                                ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
                                : 'bg-primary text-primary-foreground hover:opacity-90',
                        )}
                    >
                        <Play />
                    </button>
                </div>
            </div>
        </div>
    );
}

function IconButton({
    asChild,
    children,
    className,
    ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
    const cls = cn(
        'flex size-8 items-center justify-center rounded-full bg-background/40 hover:bg-background/70 [&_svg]:size-3.5',
        className,
    );
    if (asChild) return <span className={cls}>{children}</span>;
    return (
        <button type="button" className={cls} {...props}>
            {children}
        </button>
    );
}

const STATUS: Record<string, string> = {
    printing: 'En cours',
    completed: 'Terminé',
    cancelled: 'Annulé',
    error: 'Erreur',
};

function HistoryList({ jobs }: { jobs: PrintJobDto[] }) {
    if (!jobs.length) return <p className="mt-5 text-sm text-muted-foreground">Aucune impression enregistrée.</p>;
    return (
        <ul className="mt-5 divide-y divide-border">
            {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-4 py-3 text-sm">
                    <span
                        className={cn(
                            'size-2.5 shrink-0 rounded-full',
                            j.status === 'completed'
                                ? 'bg-primary'
                                : j.status === 'printing'
                                  ? 'bg-chart-3'
                                  : 'bg-muted-foreground/50',
                        )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium" title={j.filename}>
                        {j.filename}
                    </span>
                    <span className="text-muted-foreground">{formatDate(j.startedAt)}</span>
                    <span className="w-20 text-right tabular-nums text-muted-foreground">
                        {formatDuration(j.durationSec ?? 0)}
                    </span>
                    <span className="w-16 text-right text-muted-foreground">{STATUS[j.status] ?? j.status}</span>
                </li>
            ))}
        </ul>
    );
}
