import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { skipStateQuery } from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { ObjectPicker } from './object-picker';

export function SkipObjectsForm({ printerId }: { printerId: string }) {
    const qc = useQueryClient();
    const state = useQuery(skipStateQuery(printerId));
    const [selected, setSelected] = useState<string[]>([]);
    const close = confirmationDialogStore.actions.closeDialog;
    const onError = (e: Error) => toast.error(e.message);
    const refresh = useMutation({
        mutationFn: () => api.skip.query(printerId),
        onSuccess: (r) => qc.setQueryData(skipStateQuery(printerId).queryKey, r),
        onError,
    });
    const apply = useMutation({
        mutationFn: (names: string[]) => api.skip.apply(printerId, names),
        onSuccess: (_, names) => {
            toast.success(m.skip_applied({ count: names.length }));
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
                <p className="text-sm text-muted-foreground">{m.common_loading()}</p>
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
                    {m.skip_none_before()}
                    <code className="mx-1 rounded bg-secondary px-1">EXCLUDE_OBJECT_DEFINE</code>
                    {m.skip_none_after()}
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
                    <RefreshCw className={refresh.isPending ? 'animate-spin' : ''} /> {m.skip_resync()}
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    className="rounded-full px-5"
                    disabled={!selected.length || remaining <= 0 || apply.isPending}
                    onClick={() => apply.mutate(selected)}
                >
                    {selected.length ? m.skip_action_count({ count: selected.length }) : m.skip_action()}
                </Button>
            </DialogFooter>
        </div>
    );
}
