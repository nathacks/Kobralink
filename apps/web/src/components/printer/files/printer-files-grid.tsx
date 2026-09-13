import type { PrinterFileDto } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { printerFilesQuery, printerFileThumbQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useAlertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

const PAGE = 24;

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
    const openAlertDialog = useAlertConfirmationDialogStore((s) => s.openAlertDialog);
    const remove = useMutation({
        mutationFn: (names: string[]) => api.printerFiles.remove(printerId, names),
        onSuccess: (_, names) => {
            toast.success(
                `${names.length} fichier${names.length > 1 ? 's' : ''} supprimé${names.length > 1 ? 's' : ''} de l'imprimante`,
            );
            setSelected([]);
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'printer-files'] });
        },
        onError: (e) => toast.error(e.message),
    });
    const all = files.data ?? [];
    const filtered = all.filter((f) => f.filename.toLowerCase().includes(search.toLowerCase()));
    const list = filtered.slice(0, visible);
    const print = useMutation({
        mutationFn: (f: PrinterFileDto) =>
            api.printerFiles.print(printerId, { filename: f.filename, sizeBytes: f.sizeBytes }),
        onSuccess: (_, f) => toast.success(`Impression lancée : ${f.filename}`),
        onError: (e) => toast.error(e.message),
    });
    const [lastSearch, setLastSearch] = useState(search);
    if (search !== lastSearch) {
        setLastSearch(search);
        setVisible(PAGE);
    }
    const toggle = (n: string) => setSelected((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
    const confirmDelete = (names: string[]) =>
        openAlertDialog({
            title:
                names.length === 1
                    ? `Supprimer ${names[0]} de l'imprimante ?`
                    : `Supprimer ${names.length} fichiers de l'imprimante ?`,
            description: "Le fichier est effacé du stockage interne de l'imprimante. Le bridge n'est pas concerné.",
            actionLabel: 'Supprimer',
            onAction: () => remove.mutateAsync(names),
        });

    if (!connected) return <p className="mt-5 text-sm text-muted-foreground">Imprimante hors ligne.</p>;
    if (files.isPending)
        return <p className="mt-5 text-sm text-muted-foreground">Lecture du stockage de l'imprimante…</p>;
    if (files.isError)
        return (
            <div className="mt-5 flex items-center gap-3 text-sm text-muted-foreground">
                {files.error.message}
                <Button size="sm" variant="secondary" className="rounded-full" onClick={() => files.refetch()}>
                    <RefreshCw /> Réessayer
                </Button>
            </div>
        );

    return (
        <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                    {search
                        ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''} sur ${all.length}`
                        : `${all.length} fichier${all.length > 1 ? 's' : ''} sur l'imprimante`}
                </span>
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
                            Désélectionner
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-full"
                            disabled={remove.isPending}
                            onClick={() => confirmDelete(selected)}
                        >
                            <Trash2 /> Supprimer ({selected.length})
                        </Button>
                    </div>
                )}
            </div>
            {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun fichier.</p>
            ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                    {list.map((f) => (
                        <PrinterFileTile
                            key={f.filename}
                            printerId={printerId}
                            file={f}
                            selected={selected.includes(f.filename)}
                            onToggle={() => toggle(f.filename)}
                            onDelete={() => confirmDelete([f.filename])}
                            canPrint={canPrint && !print.isPending}
                            onPrint={() =>
                                openAlertDialog({
                                    title: `Imprimer ${f.filename} ?`,
                                    description:
                                        "Le fichier est lancé directement depuis le stockage de l'imprimante, avec les slots AMS chargés.",
                                    actionLabel: 'Imprimer',
                                    onAction: () => print.mutateAsync(f),
                                })
                            }
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
                        Afficher plus ({filtered.length - visible} restants)
                    </Button>
                </div>
            )}
        </div>
    );
}

function PrinterFileTile({
    printerId,
    file,
    selected,
    onToggle,
    onDelete,
    canPrint,
    onPrint,
}: {
    printerId: string;
    file: PrinterFileDto;
    selected: boolean;
    onToggle: () => void;
    onDelete: () => void;
    canPrint: boolean;
    onPrint: () => void;
}) {
    const thumb = useQuery(printerFileThumbQuery(printerId, file.filename));
    return (
        <div
            className={cn(
                'group relative flex min-h-44 flex-col rounded-3xl bg-secondary p-4 text-secondary-foreground transition-shadow',
                selected && 'ring-2 ring-primary',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <button
                    type="button"
                    onClick={onToggle}
                    aria-pressed={selected}
                    title={selected ? 'Désélectionner' : 'Sélectionner'}
                    className={cn(
                        'flex size-6 items-center justify-center rounded-full border transition-colors',
                        selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                    )}
                >
                    {selected && <Check className="size-3.5" />}
                </button>
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-background/40">
                    {thumb.data?.thumbnail ? (
                        <img
                            src={`data:image/png;base64,${thumb.data.thumbnail}`}
                            alt=""
                            className="size-full object-contain"
                        />
                    ) : (
                        <span className="text-[10px] text-muted-foreground">{thumb.isPending ? '…' : 'GCode'}</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onDelete}
                    title="Supprimer de l'imprimante"
                    className="rounded-full p-1.5 opacity-0 transition-opacity hover:bg-background/40 group-hover:opacity-100 focus-visible:opacity-100"
                >
                    <Trash2 className="size-4" />
                </button>
            </div>
            <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium" title={file.filename}>
                        {file.filename}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {formatBytes(file.sizeBytes)}
                        {file.timestamp ? ` · ${new Date(file.timestamp).toLocaleDateString('fr-FR')}` : ''}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onPrint}
                    disabled={!canPrint}
                    title="Imprimer depuis l'imprimante"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                    <Play className="size-4" />
                </button>
            </div>
        </div>
    );
}
