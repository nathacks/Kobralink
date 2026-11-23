import { PRINTER_FILE_LIST_LIMIT, type PrinterFileDto, printerFilePath } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Check, Eye, HardDrive, ImageOff, Loader2, MoreVertical, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { parseFilename } from '@/lib/filename';
import { formatBytes, formatShortDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { printerFilesQuery, printerFileThumbQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

const PAGE = 24;
const LOADING_TILES = [0, 90, 180, 270, 360, 450, 540, 630];

export function PrinterFilesGrid({
    printerId,
    connected,
    canPrint,
    search,
}: {
    printerId: string;
    connected: boolean;
    canPrint: boolean;
    search: string;
}) {
    const qc = useQueryClient();
    const files = useQuery(printerFilesQuery(printerId, connected));
    const [visible, setVisible] = useState(PAGE);
    const [selected, setSelected] = useState<string[]>([]);
    const openAlertDialog = alertConfirmationDialogStore.actions.openAlertDialog;
    const openDialog = confirmationDialogStore.actions.openDialog;
    const remove = useMutation({
        mutationFn: (names: string[]) => api.printerFiles.remove(printerId, names),
        onSuccess: (_, names) => {
            toast.success(m.pfiles_deleted({ count: names.length }));
            setSelected([]);
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'printer-files'] });
        },
        onError: (e) => toast.error(e.message),
    });
    const all = files.data?.files ?? [];
    const matches = (f: PrinterFileDto) => f.filename.toLowerCase().includes(search.toLowerCase());
    const filtered = all.filter(matches);
    const list = filtered.slice(0, visible);
    const testModels = (files.data?.testModels ?? []).filter(matches);
    const print = useMutation({
        mutationFn: (f: PrinterFileDto) =>
            api.printerFiles.print(printerId, { filename: printerFilePath(f), sizeBytes: f.sizeBytes }),
        onSuccess: (_, f) => toast.success(m.files_print_started({ name: f.filename })),
        onError: (e) => toast.error(e.message),
    });
    const [lastSearch, setLastSearch] = useState(search);
    if (search !== lastSearch) {
        setLastSearch(search);
        setVisible(PAGE);
    }
    const toggle = (n: string) => setSelected((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
    const preview = (f: PrinterFileDto) =>
        openDialog({
            title: parseFilename(f.filename).name,
            props: { className: 'rounded-3xl sm:max-w-xl' },
            content: <PrinterFilePreview printerId={printerId} file={f} />,
        });
    const confirmPrint = (f: PrinterFileDto) =>
        openAlertDialog({
            title: m.pfiles_print_title({ name: f.filename }),
            description: m.pfiles_print_hint(),
            actionLabel: m.common_print(),
            onAction: () => print.mutateAsync(f),
        });
    const confirmDelete = (names: string[]) =>
        openAlertDialog({
            title:
                names.length === 1
                    ? m.pfiles_delete_one_title({ name: names[0] })
                    : m.pfiles_delete_many_title({ count: names.length }),
            description: m.pfiles_delete_hint(),
            actionLabel: m.common_delete(),
            onAction: () => remove.mutateAsync(names),
        });

    if (!connected) return <p className="text-sm text-muted-foreground">{m.common_printer_offline()}</p>;
    if (files.isPending) return <PrinterFilesLoading />;
    if (files.isError)
        return (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {files.error.message}
                <Button size="sm" variant="secondary" className="rounded-full" onClick={() => files.refetch()}>
                    <RefreshCw /> {m.common_retry()}
                </Button>
            </div>
        );

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                    {search
                        ? m.pfiles_results({ count: filtered.length, total: all.length })
                        : m.pfiles_count({ count: all.length })}
                </span>
                {files.data?.truncated && <span>{m.pfiles_truncated({ count: PRINTER_FILE_LIST_LIMIT })}</span>}
                <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    disabled={files.isFetching}
                    onClick={() => files.refetch()}
                >
                    <RefreshCw className={files.isFetching ? 'animate-spin' : ''} />
                </Button>
                {selected.length > 0 && (
                    <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setSelected([])}>
                            {m.pfiles_deselect()}
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-full"
                            disabled={remove.isPending}
                            onClick={() => confirmDelete(selected)}
                        >
                            <Trash2 /> {m.pfiles_delete_count({ count: selected.length })}
                        </Button>
                    </div>
                )}
            </div>
            {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.pfiles_empty()}</p>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3">
                    {list.map((f) => (
                        <PrinterFileTile
                            key={f.filename}
                            printerId={printerId}
                            file={f}
                            selected={selected.includes(f.filename)}
                            onToggle={() => toggle(f.filename)}
                            onDelete={() => confirmDelete([f.filename])}
                            onPreview={() => preview(f)}
                            canPrint={canPrint && !print.isPending}
                            onPrint={() => confirmPrint(f)}
                        />
                    ))}
                </div>
            )}
            {visible < filtered.length && (
                <div className="flex justify-center pt-1">
                    <Button
                        variant="secondary"
                        className="rounded-full px-5"
                        onClick={() => setVisible((v) => v + PAGE)}
                    >
                        {m.pfiles_show_more({ count: filtered.length - visible })}
                    </Button>
                </div>
            )}
            {testModels.length > 0 && (
                <section aria-labelledby="printer-test-models" className="space-y-3 pt-3">
                    <div>
                        <h3 id="printer-test-models" className="text-sm font-medium">
                            {m.pfiles_test_models()}
                        </h3>
                        <p className="text-xs text-muted-foreground">{m.pfiles_test_models_hint()}</p>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3">
                        {testModels.map((f) => (
                            <PrinterFileTile
                                key={printerFilePath(f)}
                                printerId={printerId}
                                file={f}
                                selected={false}
                                onPreview={() => preview(f)}
                                canPrint={canPrint && !print.isPending}
                                onPrint={() => confirmPrint(f)}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

function PrinterFilesLoading() {
    return (
        <div className="space-y-3" aria-busy="true">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary-strong">
                    <HardDrive className="size-3.5" />
                    <Loader2
                        className="absolute inset-0 size-full animate-spin text-primary-strong/60"
                        strokeWidth={1.5}
                    />
                </span>
                <span>{m.pfiles_reading()}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3">
                {LOADING_TILES.map((delay) => (
                    <div
                        key={delay}
                        className="flex min-h-64 animate-pulse flex-col rounded-3xl bg-secondary/60 p-4"
                        style={{ animationDelay: `${delay}ms` }}
                    >
                        <div className="flex justify-center">
                            <Skeleton className="size-12 rounded-2xl bg-background/40" />
                        </div>
                        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className="h-3.5 w-3/4 rounded-full bg-background/40" />
                                <Skeleton className="h-2.5 w-1/2 rounded-full bg-background/30" />
                            </div>
                            <Skeleton className="size-9 shrink-0 rounded-full bg-background/40" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PrinterFileTile({
    printerId,
    file,
    selected,
    onToggle,
    onDelete,
    onPreview,
    canPrint,
    onPrint,
}: {
    printerId: string;
    file: PrinterFileDto;
    selected: boolean;
    onToggle?: () => void;
    onDelete?: () => void;
    onPreview: () => void;
    canPrint: boolean;
    onPrint: () => void;
}) {
    const thumb = useQuery(printerFileThumbQuery(printerId, printerFilePath(file)));
    const { name, plate } = parseFilename(file.filename);
    return (
        <article
            className={cn(
                'group relative flex flex-col overflow-hidden rounded-3xl bg-secondary text-secondary-foreground transition-shadow',
                selected && 'ring-2 ring-primary',
            )}
        >
            <div className="relative">
                <button
                    type="button"
                    onClick={onPreview}
                    aria-label={`${m.files_preview()}: ${name}`}
                    className="flex aspect-[4/3] w-full items-center justify-center bg-background/40 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                    {thumb.data?.thumbnail ? (
                        <img
                            src={`data:image/png;base64,${thumb.data.thumbnail}`}
                            alt=""
                            className="size-full object-contain p-3"
                        />
                    ) : thumb.isPending ? (
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    ) : (
                        <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                            <Box className="size-8 opacity-60" />
                            {m.files_no_preview()}
                        </span>
                    )}
                </button>
                {onToggle && (
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-pressed={selected}
                        aria-label={selected ? m.pfiles_deselect() : m.pfiles_select()}
                        title={selected ? m.pfiles_deselect() : m.pfiles_select()}
                        className={cn(
                            'absolute left-2.5 top-2.5 flex size-7 items-center justify-center rounded-full border backdrop-blur-sm transition-colors',
                            selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-foreground/30 bg-background/60 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100',
                        )}
                    >
                        {selected && <Check className="size-4" />}
                    </button>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={m.files_actions()}
                            className="absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur-sm transition-opacity hover:bg-background/90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-4"
                        >
                            <MoreVertical />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-2xl">
                        <DropdownMenuItem onSelect={onPreview} className="rounded-xl cursor-pointer">
                            <Eye />
                            <span>{m.files_preview()}</span>
                        </DropdownMenuItem>
                        {onDelete && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={onDelete}
                                    className="rounded-xl cursor-pointer"
                                >
                                    <Trash2 />
                                    <span>{m.common_delete()}</span>
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="flex flex-1 items-end justify-between gap-2 p-3.5">
                <div className="min-w-0 space-y-1">
                    <h3 className="line-clamp-2 text-sm font-medium leading-snug" title={file.filename}>
                        {name}
                    </h3>
                    <div className="text-xs text-muted-foreground">
                        {[
                            plate !== null ? m.files_plate({ n: plate }) : '',
                            formatBytes(file.sizeBytes),
                            file.timestamp ? formatShortDate(file.timestamp) : '',
                        ]
                            .filter(Boolean)
                            .join(', ')}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onPrint}
                    disabled={!canPrint}
                    title={m.pfiles_print_from_printer()}
                    aria-label={`${m.pfiles_print_from_printer()}: ${name}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                    <Play className="size-4" />
                </button>
            </div>
        </article>
    );
}

function PrinterFilePreview({ printerId, file }: { printerId: string; file: PrinterFileDto }) {
    const thumb = useQuery(printerFileThumbQuery(printerId, printerFilePath(file)));
    return (
        <div className="grid gap-3 py-2">
            <div className="flex aspect-square max-h-[55svh] w-full items-center justify-center overflow-hidden rounded-2xl bg-secondary">
                {thumb.data?.thumbnail ? (
                    <img
                        src={`data:image/png;base64,${thumb.data.thumbnail}`}
                        alt={file.filename}
                        className="size-full object-contain"
                    />
                ) : thumb.isPending ? (
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <ImageOff className="size-8 text-muted-foreground/50" />
                        {m.pfiles_preview_unavailable()}
                    </div>
                )}
            </div>
            <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                    {formatBytes(file.sizeBytes)}
                    {file.timestamp ? ` · ${formatShortDate(file.timestamp)}` : ''}
                </span>
                <span className="text-xs text-muted-foreground">{m.pfiles_preview_hint()}</span>
            </div>
        </div>
    );
}
