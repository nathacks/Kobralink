import type { GcodeFileDto } from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { m } from '@/lib/i18n';
import { fileObjectsQuery } from '@/lib/queries';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { ObjectPicker } from './object-picker';

export function PrePrintSkipForm({
    printerId,
    file,
    onPrint,
}: {
    printerId: string;
    file: GcodeFileDto;
    onPrint: (excluded: string[]) => Promise<unknown>;
}) {
    const objects = useQuery(fileObjectsQuery(printerId, file.id));
    const [excluded, setExcluded] = useState<string[]>([]);
    const [pending, setPending] = useState(false);
    const close = confirmationDialogStore.actions.closeDialog;
    const names = objects.data?.names.length ? objects.data.names : file.objects;
    const toggle = (n: string) => setExcluded((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
    const remaining = names.length - excluded.length;

    return (
        <div className="grid gap-4 py-2">
            {names.length ? (
                <ObjectPicker objects={names} selected={excluded} onToggle={toggle} svgB64={objects.data?.svgB64} />
            ) : (
                <p className="text-sm text-muted-foreground">{m.preprint_loading()}</p>
            )}
            <DialogFooter className="sm:justify-between">
                <span className="self-center text-xs text-muted-foreground">
                    {excluded.length ? m.preprint_count({ remaining, total: names.length }) : m.preprint_all()}
                </span>
                <Button
                    type="button"
                    className="rounded-full px-5"
                    disabled={pending || remaining <= 0}
                    onClick={async () => {
                        setPending(true);
                        try {
                            await onPrint(excluded);
                            close();
                        } finally {
                            setPending(false);
                        }
                    }}
                >
                    <Play /> {m.common_print()}
                </Button>
            </DialogFooter>
        </div>
    );
}
