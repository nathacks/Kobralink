import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { skipStateQuery } from '@/lib/queries';
import { useConfirmationDialogStore } from '@/stores/confirmation-dialog';
import { ObjectPicker } from './object-picker';

export function SkipObjectsForm({ printerId }: { printerId: string }) {
    const qc = useQueryClient();
    const state = useQuery(skipStateQuery(printerId));
    const [selected, setSelected] = useState<string[]>([]);
    const close = useConfirmationDialogStore((s) => s.closeDialog);
    const onError = (e: Error) => toast.error(e.message);
    const refresh = useMutation({
        mutationFn: () => api.skip.query(printerId),
        onSuccess: (r) => qc.setQueryData(skipStateQuery(printerId).queryKey, r),
        onError,
    });
    const apply = useMutation({
        mutationFn: (names: string[]) => api.skip.apply(printerId, names),
        onSuccess: (_, names) => {
            toast.success(`${names.length} objet${names.length > 1 ? 's' : ''} ignoré${names.length > 1 ? 's' : ''}`);
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'skip'] });
            close();
        },
        onError,
    });
    const objects = state.data?.objects ?? [];
    const skipped = state.data?.skipped ?? [];
    const toggle = (n: string) => setSelected((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
    const remaining = objects.length - skipped.length - selected.length;

    return (
        <div className="grid gap-4 py-2">
            {state.isPending ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : objects.length ? (
                <ObjectPicker
                    objects={objects}
                    selected={selected}
                    locked={skipped}
                    onToggle={toggle}
                    svgB64={state.data?.svgB64}
                />
            ) : (
                <p className="text-sm text-muted-foreground">
                    Aucun objet identifié pour ce fichier. Le GCode doit contenir des marqueurs
                    <code className="mx-1 rounded bg-secondary px-1">EXCLUDE_OBJECT_DEFINE</code>(option « Étiqueter les
                    objets » dans OrcaSlicer).
                </p>
            )}
            <DialogFooter className="sm:justify-between">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    disabled={refresh.isPending}
                    onClick={() => refresh.mutate()}
                >
                    <RefreshCw className={refresh.isPending ? 'animate-spin' : ''} /> Resynchroniser
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    className="rounded-full px-5"
                    disabled={!selected.length || remaining <= 0 || apply.isPending}
                    onClick={() => apply.mutate(selected)}
                >
                    Ignorer {selected.length ? `(${selected.length})` : ''}
                </Button>
            </DialogFooter>
        </div>
    );
}
