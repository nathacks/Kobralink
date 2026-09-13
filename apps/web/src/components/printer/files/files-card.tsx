import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PrePrintSkipForm } from '@/components/printer/skip/preprint-skip-form';
import { api } from '@/lib/api';
import { filesQuery, historyQuery } from '@/lib/queries';
import { useAlertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { useConfirmationDialogStore } from '@/stores/confirmation-dialog';
import { useLiveState } from '@/stores/printers';
import { FileTile } from './file-tile';
import { HistoryList } from './history-list';
import { PrinterFilesGrid } from './printer-files-grid';
import { TabButton } from './tab-button';

type Tab = 'files' | 'web' | 'printer' | 'history';

export function FilesCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const qc = useQueryClient();
    const files = useQuery(filesQuery(printerId));
    const jobs = useQuery(historyQuery(printerId));
    const inputRef = useRef<HTMLInputElement>(null);
    const [tab, setTab] = useState<Tab>('files');
    const [search, setSearch] = useState('');
    const openAlertDialog = useAlertConfirmationDialogStore((s) => s.openAlertDialog);
    const openDialog = useConfirmationDialogStore((s) => s.openDialog);
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
        mutationFn: (input: { fileId: string; excludedObjects?: string[] }) => api.files.print(printerId, input),
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

    const list = (files.data ?? [])
        .filter((f) => (tab === 'web' ? f.webUnverified : true))
        .filter((f) => f.filename.toLowerCase().includes(search.toLowerCase()));
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
                <TabButton active={tab === 'printer'} onClick={() => setTab('printer')}>
                    Imprimante
                </TabButton>
                <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
                    Historique
                </TabButton>
            </div>
            {tab !== 'history' && (
                <label className="mt-3 flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
                    <Search className="size-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher un fichier…"
                        className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                </label>
            )}

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
            ) : tab === 'printer' ? (
                <PrinterFilesGrid
                    printerId={printerId}
                    connected={state.connected}
                    canPrint={canPrint}
                    search={search}
                />
            ) : (
                <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                    {list.map((f, i) => (
                        <FileTile
                            key={f.id}
                            file={f}
                            printerId={printerId}
                            highlight={i === 0 && !!f.lastJob && f.lastJob.status === 'printing'}
                            canPrint={canPrint && !print.isPending}
                            onPrint={() =>
                                f.objects.length
                                    ? openDialog({
                                          title: `Imprimer ${f.filename}`,
                                          description:
                                              'Décochez les objets à ne pas imprimer. Ils seront ignorés dès le début.',
                                          content: (
                                              <PrePrintSkipForm
                                                  printerId={printerId}
                                                  file={f}
                                                  onPrint={(excludedObjects) =>
                                                      print.mutateAsync({ fileId: f.id, excludedObjects })
                                                  }
                                              />
                                          ),
                                      })
                                    : print.mutate({ fileId: f.id })
                            }
                            onDelete={() =>
                                openAlertDialog({
                                    title: `Supprimer ${f.filename} ?`,
                                    description: 'Le fichier sera retiré du stockage du bridge.',
                                    actionLabel: 'Supprimer',
                                    onAction: () => remove.mutateAsync(f.id),
                                })
                            }
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
