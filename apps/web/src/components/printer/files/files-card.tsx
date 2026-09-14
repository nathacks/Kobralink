import type { GcodeFileDto } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GcodePreview } from '@/components/printer/files/gcode-preview';
import { PrePrintSkipForm } from '@/components/printer/skip/preprint-skip-form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { filesQuery, historyQuery } from '@/lib/queries';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { FileTile } from './file-tile';
import { HistoryList } from './history-list';
import { PrinterFilesGrid } from './printer-files-grid';
import { TabButton } from './tab-button';
import { TimelapseList } from './timelapse-list';
import { UploadReadyForm } from './upload-ready-form';

type Tab = 'files' | 'web' | 'printer' | 'history' | 'timelapses';

export function FilesCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const printer = usePrinter(printerId);
    const qc = useQueryClient();
    const files = useQuery(filesQuery(printerId));
    const jobs = useQuery(historyQuery(printerId));
    const inputRef = useRef<HTMLInputElement>(null);
    const [tab, setTab] = useState<Tab>('files');
    const [search, setSearch] = useState('');
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const openAlertDialog = alertConfirmationDialogStore.actions.openAlertDialog;
    const openDialog = confirmationDialogStore.actions.openDialog;
    const busy = state.printState === 'printing' || state.printState === 'paused';
    const canPrint = state.connected && !busy;

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'files'] });
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'history'] });
    };
    const enqueue = useMutation({
        mutationFn: (input: { fileId: string; excludedObjects?: string[] }) => api.queue.add(printerId, input),
        onSuccess: (item) => {
            toast.success(m.queue_added({ name: item.filename }));
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'queue'] });
        },
        onError: (e) => toast.error(e.message),
    });
    const print = useMutation({
        mutationFn: (input: { fileId: string; excludedObjects?: string[] }) => api.files.print(printerId, input),
        onSuccess: (f) => {
            toast.success(m.files_print_started({ name: f.filename }));
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });
    const requestPrint = (f: GcodeFileDto) => {
        const go = () =>
            f.objects.length
                ? openDialog({
                      title: m.files_print_title({ name: f.filename }),
                      description: m.files_print_hint(),
                      content: (
                          <PrePrintSkipForm
                              printerId={printerId}
                              file={f}
                              onPrint={(excludedObjects) => print.mutateAsync({ fileId: f.id, excludedObjects })}
                          />
                      ),
                  })
                : print.mutate({ fileId: f.id });
        if (f.webUnverified && (printer?.settings.webUploadWarning ?? true)) {
            openAlertDialog({
                title: m.files_web_warning_title(),
                description: m.files_web_warning_hint({ name: f.filename }),
                actionLabel: m.files_web_warning_action(),
                onAction: async () => {
                    await api.files.verify(printerId, f.id).catch(() => undefined);
                    invalidate();
                    go();
                },
            });
            return;
        }
        go();
    };
    const upload = useMutation({
        mutationFn: (file: File) => api.files.upload(printerId, file, false),
        onSuccess: (f) => {
            invalidate();
            if (printer?.settings.printStartDialog ?? true) {
                openDialog({
                    title: m.files_added({ name: f.filename }),
                    content: (
                        <UploadReadyForm
                            file={f}
                            canPrint={canPrint}
                            onPrint={() => requestPrint(f)}
                            onQueue={() => enqueue.mutate({ fileId: f.id })}
                        />
                    ),
                });
            } else {
                toast.success(m.files_added({ name: f.filename }), {
                    action: canPrint ? { label: m.common_print(), onClick: () => requestPrint(f) } : undefined,
                });
            }
        },
        onError: (e) => toast.error(e.message),
    });
    const remove = useMutation({
        mutationFn: (fileId: string) => api.files.remove(printerId, fileId),
        onSuccess: invalidate,
        onError: (e) => toast.error(e.message),
    });
    const isGcode = (f: File) => /\.(gcode|bgcode)$/i.test(f.name);
    const uploadMany = async (dropped: FileList | null) => {
        const accepted = Array.from(dropped ?? []).filter(isGcode);
        if (!accepted.length) {
            if (dropped?.length) toast.error(m.files_drop_invalid());
            return;
        }
        for (const file of accepted) await upload.mutateAsync(file).catch(() => undefined);
    };
    const dropEnabled = tab === 'files' || tab === 'web';
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
    const onDragEnter = (e: DragEvent) => {
        if (!dropEnabled || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
        if (!dropEnabled || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
        if (!dropEnabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
        if (!dropEnabled || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void uploadMany(e.dataTransfer.files);
    };

    const list = (files.data ?? [])
        .filter((f) => (tab === 'web' ? f.webUnverified : true))
        .filter((f) => f.filename.toLowerCase().includes(search.toLowerCase()));
    const webCount = files.data?.filter((f) => f.webUnverified).length ?? 0;

    return (
        <section
            className="relative flex flex-col overflow-hidden rounded-3xl bg-card p-6 text-card-foreground"
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {dragging && (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-card/90 text-sm text-foreground">
                    <Upload className="size-8 text-primary" />
                    {m.files_drop_hint()}
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-medium">{m.files_title()}</h2>
                <span className="text-sm text-muted-foreground">
                    {files.data ? m.files_stored({ count: files.data.length }) : ''}
                </span>
            </div>
            <div className="mt-4 flex w-fit gap-1 rounded-full bg-secondary p-1">
                <TabButton active={tab === 'files'} onClick={() => setTab('files')}>
                    {m.files_tab_all()}
                </TabButton>
                <TabButton active={tab === 'web'} onClick={() => setTab('web')}>
                    {m.files_tab_web()}
                    {webCount ? ` · ${webCount}` : ''}
                </TabButton>
                <TabButton active={tab === 'printer'} onClick={() => setTab('printer')}>
                    {m.files_tab_printer()}
                </TabButton>
                <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
                    {m.files_tab_history()}
                </TabButton>
                <TabButton active={tab === 'timelapses'} onClick={() => setTab('timelapses')}>
                    {m.files_tab_timelapses()}
                </TabButton>
            </div>
            {tab !== 'history' && tab !== 'timelapses' && (
                <label className="mt-3 flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
                    <Search className="size-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={m.files_search()}
                        className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                </label>
            )}

            <input
                ref={inputRef}
                type="file"
                accept=".gcode,.bgcode"
                multiple
                className="hidden"
                onChange={(e) => {
                    const picked = e.target.files;
                    void uploadMany(picked);
                    e.target.value = '';
                }}
            />

            <ScrollArea className="min-h-0 flex-1">
                {tab === 'history' ? (
                    <HistoryList jobs={jobs.data ?? []} />
                ) : tab === 'timelapses' ? (
                    <TimelapseList printerId={printerId} />
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
                                onPrint={() => requestPrint(f)}
                                onQueue={() => enqueue.mutate({ fileId: f.id })}
                                onPreview={() =>
                                    openDialog({
                                        title: f.filename,
                                        props: { className: 'rounded-3xl sm:max-w-4xl' },
                                        content: <GcodePreview printerId={printerId} file={f} />,
                                    })
                                }
                                onDelete={() =>
                                    openAlertDialog({
                                        title: m.files_delete_title({ name: f.filename }),
                                        description: m.files_delete_hint(),
                                        actionLabel: m.common_delete(),
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
                            {upload.isPending ? m.files_uploading() : m.files_add_gcode()}
                        </button>
                    </div>
                )}
            </ScrollArea>
        </section>
    );
}
