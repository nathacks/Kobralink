import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { GcodePreview } from '@/components/printer/files/gcode-preview';
import { ScrollAreaWithShadow } from '@/components/ui/scroll-area-with-shadow';
import { useFileActions } from '@/hooks/use-file-actions';
import { useFileDrop } from '@/hooks/use-file-drop';
import { m } from '@/lib/i18n';
import { filesQuery, historyQuery } from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { FileTile } from './file-tile';
import { HistoryList } from './history-list';
import { PrinterFilesGrid } from './printer-files-grid';
import { TabButton } from './tab-button';
import { TimelapseList } from './timelapse-list';
import { DropOverlay, UploadEmptyState } from './upload-empty-state';

type Tab = 'files' | 'web' | 'printer' | 'history' | 'timelapses';

const TABS: { id: Tab; label: () => string }[] = [
    { id: 'files', label: m.files_tab_all },
    { id: 'web', label: m.files_tab_web },
    { id: 'printer', label: m.files_tab_printer },
    { id: 'history', label: m.files_tab_history },
    { id: 'timelapses', label: m.files_tab_timelapses },
];

export function FilesCard({ printerId }: { printerId: string }) {
    const files = useQuery(filesQuery(printerId));
    const jobs = useQuery(historyQuery(printerId));

    const inputRef = useRef<HTMLInputElement>(null);
    const sectionRef = useRef<HTMLElement>(null);

    const [tab, setTab] = useState<Tab>('files');
    const [search, setSearch] = useState('');

    const openDialog = confirmationDialogStore.actions.openDialog;

    const actions = useFileActions(printerId);
    const dragging = useFileDrop(sectionRef, tab === 'files' || tab === 'web', actions.uploadMany);

    const pick = () => inputRef.current?.click();
    const searchable = tab === 'files' || tab === 'web' || tab === 'printer';
    const list = (files.data ?? [])
        .filter((f) => (tab === 'web' ? f.webUnverified : true))
        .filter((f) => f.filename.toLowerCase().includes(search.toLowerCase()));
    const webCount = files.data?.filter((f) => f.webUnverified).length ?? 0;

    const renderContent = () => {
        if (tab === 'history') return <HistoryList jobs={jobs.data ?? []} />;
        if (tab === 'timelapses') return <TimelapseList printerId={printerId} />;
        if (tab === 'printer') {
            return (
                <PrinterFilesGrid
                    printerId={printerId}
                    connected={actions.connected}
                    canPrint={actions.canPrint}
                    search={search}
                />
            );
        }
        if (search.trim() !== '' && list.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
                    <Search className="mb-2 size-8 text-muted-foreground/50" />
                    <p>{m.files_empty_search()}</p>
                </div>
            );
        }
        if (tab === 'web' && webCount === 0) {
            return (
                <UploadEmptyState
                    title={m.files_web_empty_title()}
                    hint={m.files_web_empty_hint()}
                    uploading={actions.isUploading}
                    onPick={pick}
                />
            );
        }
        if ((files.data?.length ?? 0) === 0) {
            return (
                <UploadEmptyState
                    title={m.files_empty()}
                    hint={m.files_upload_drop_zone()}
                    uploading={actions.isUploading}
                    onPick={pick}
                />
            );
        }
        return (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                {list.map((f, i) => (
                    <FileTile
                        key={f.id}
                        file={f}
                        printerId={printerId}
                        highlight={i === 0 && f.lastJob?.status === 'printing'}
                        canPrint={actions.canPrint}
                        onPrint={() => actions.requestPrint(f)}
                        onQueue={() => actions.enqueue(f)}
                        onPreview={() =>
                            openDialog({
                                title: f.filename,
                                props: { className: 'rounded-3xl sm:max-w-4xl' },
                                content: <GcodePreview printerId={printerId} file={f} />,
                            })
                        }
                        onDelete={() => actions.requestDelete(f)}
                    />
                ))}
                <button
                    type="button"
                    onClick={pick}
                    disabled={actions.isUploading}
                    className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-primary/40 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                >
                    <Plus className="size-6" />
                    {actions.isUploading ? m.files_uploading() : m.files_add_gcode()}
                </button>
            </div>
        );
    };

    return (
        <section
            ref={sectionRef}
            className="relative flex flex-col overflow-hidden rounded-3xl bg-card p-6 px-0 text-card-foreground"
        >
            {dragging && <DropOverlay />}
            <div className={'mx-6'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-medium">{m.files_title()}</h2>
                    <span className="text-sm text-muted-foreground">
                        {files.data ? m.files_stored({ count: files.data.length }) : ''}
                    </span>
                </div>
                <div className="scrollbar-none -mx-6 mt-4 overflow-x-auto px-6">
                    <div className="flex w-fit gap-1 rounded-full bg-secondary p-1">
                        {TABS.map((t) => (
                            <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                                {t.label()}
                                {t.id === 'web' && webCount ? ` · ${webCount}` : ''}
                            </TabButton>
                        ))}
                    </div>
                </div>
                {searchable && (
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
                {actions.isUploading && (
                    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-2.5 text-xs font-medium text-primary">
                        <Loader2 className="size-4 animate-spin" />
                        <span>
                            {actions.uploadingCount > 1
                                ? m.files_uploading_count({ count: actions.uploadingCount })
                                : m.files_uploading()}
                        </span>
                    </div>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept=".gcode,.bgcode"
                multiple
                className="hidden"
                onChange={(e) => {
                    void actions.uploadMany(e.target.files);
                    e.target.value = '';
                }}
            />
            <ScrollAreaWithShadow bottomShadow className="h-full" viewportClassName="pt-5">
                <div className={'px-6'}>{renderContent()}</div>
            </ScrollAreaWithShadow>
        </section>
    );
}
