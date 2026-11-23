import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { spoolAssignmentsQuery, spoolmanSpoolsQuery, spoolmanStatusQuery, spoolsQuery } from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export const EXTERNAL_SLOT = '0';

export function ExternalSpoolForm({
    printerId,
    onClose = confirmationDialogStore.actions.closeDialog,
}: {
    printerId: string;
    onClose?: () => void;
}) {
    const qc = useQueryClient();
    const spoolman = useQuery(spoolmanStatusQuery(printerId));
    const spoolmanOn = Boolean(spoolman.data?.configured);
    const spools = useQuery(spoolmanSpoolsQuery(spoolmanOn));
    const localSpools = useQuery(spoolsQuery());
    const localAssign = useQuery(spoolAssignmentsQuery(printerId));
    const [spoolId, setSpoolId] = useState<number | null>(null);
    const [localSpoolId, setLocalSpoolId] = useState<string | null>(null);

    const currentSpool = spoolman.data?.slotSpools[EXTERNAL_SLOT] ?? 0;
    const currentLocal = localAssign.data?.slotSpools[EXTERNAL_SLOT] ?? '';
    const nextSpool = spoolId ?? currentSpool;
    const nextLocal = localSpoolId ?? currentLocal;
    const hasLocal = !spoolmanOn && (localSpools.data?.length ?? 0) > 0;

    const save = useMutation({
        mutationFn: async () => {
            const tasks: Promise<unknown>[] = [];
            if (spoolmanOn && nextSpool !== currentSpool) {
                const map = { ...(spoolman.data?.slotSpools ?? {}) };
                if (nextSpool > 0) map[EXTERNAL_SLOT] = nextSpool;
                else delete map[EXTERNAL_SLOT];
                tasks.push(api.spoolman.setSlots(printerId, map));
            }
            if (!spoolmanOn && nextLocal !== currentLocal) {
                tasks.push(api.spools.assign(printerId, { [EXTERNAL_SLOT]: nextLocal || null }));
            }
            await Promise.all(tasks);
        },
        onSuccess: () => {
            toast.success(m.external_spool_saved());
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'spoolman'] });
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'spools'] });
            onClose();
        },
        onError: (e: Error) => toast.error(e.message),
    });

    if (spoolman.isPending || localAssign.isPending) {
        return <div className="h-40 animate-pulse rounded-2xl bg-secondary/60" />;
    }

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
            }}
        >
            <div className="grid gap-4 py-4">
                {spoolmanOn && (
                    <div className="grid gap-2">
                        <Label htmlFor="external-spool">{m.slot_spool()}</Label>
                        <Select
                            value={String(nextSpool)}
                            onValueChange={(v) => setSpoolId(Number(v))}
                            disabled={spools.isPending}
                        >
                            <SelectTrigger id="external-spool" className="rounded-full">
                                <SelectValue
                                    placeholder={spools.isError ? m.slot_spool_unreachable() : m.slot_spool_none()}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">{m.slot_spool_none()}</SelectItem>
                                {(spools.data ?? [])
                                    .filter((sp) => !sp.archived)
                                    .map((sp) => (
                                        <SelectItem key={sp.id} value={String(sp.id)}>
                                            #{sp.id} · {sp.filament.vendor?.name ? `${sp.filament.vendor.name} ` : ''}
                                            {sp.filament.name ?? sp.filament.material ?? ''}
                                            {sp.remaining_weight !== undefined
                                                ? ` · ${Math.round(sp.remaining_weight)} g`
                                                : ''}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="px-4 text-xs text-muted-foreground">{m.slot_spool_hint()}</p>
                    </div>
                )}
                {hasLocal && (
                    <div className="grid gap-2">
                        <Label htmlFor="external-local-spool">{m.slot_local_spool()}</Label>
                        <Select
                            value={nextLocal || '__none'}
                            onValueChange={(v) => setLocalSpoolId(v === '__none' ? '' : v)}
                        >
                            <SelectTrigger id="external-local-spool" className="rounded-full">
                                <SelectValue placeholder={m.slot_spool_none()} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none">{m.slot_spool_none()}</SelectItem>
                                {(localSpools.data ?? []).map((sp) => (
                                    <SelectItem key={sp.id} value={sp.id}>
                                        <span
                                            className="mr-2 inline-block size-2.5 rounded-full ring-1 ring-black/10"
                                            style={{ background: sp.colorHex }}
                                        />
                                        {sp.vendor ? `${sp.vendor} ` : ''}
                                        {sp.name} · {sp.material} · {Math.round(sp.remainingG)} g
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="px-4 text-xs text-muted-foreground">{m.slot_local_spool_hint()}</p>
                    </div>
                )}
                {!spoolmanOn && !hasLocal && (
                    <p className="text-sm text-muted-foreground">{m.external_spool_no_inventory()}</p>
                )}
            </div>
            <DialogFooter>
                <Button
                    type="submit"
                    className="rounded-full px-5"
                    disabled={save.isPending || (!spoolmanOn && !hasLocal)}
                >
                    {m.common_save()}
                </Button>
            </DialogFooter>
        </form>
    );
}
