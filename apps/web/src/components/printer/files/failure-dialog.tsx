import { FAILURE_REASONS, type FailureReason, type PrintJobDto } from '@farolprint/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDate, formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { failureReasonLabel, printerErrorText } from '@/lib/labels';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

const NONE = '__none__';

export function FailureDialog({ printerId, job }: { printerId: string; job: PrintJobDto }) {
    const qc = useQueryClient();
    const close = confirmationDialogStore.actions.closeDialog;
    const [reason, setReason] = useState<FailureReason | ''>(job.failureReason);
    const [note, setNote] = useState(job.note);
    const save = useMutation({
        mutationFn: () => api.files.updateJob(printerId, job.id, { failureReason: reason, note: note.trim() }),
        onSuccess: () => {
            toast.success(m.history_failure_saved());
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'history'] });
            void qc.invalidateQueries({ queryKey: ['stats'] });
            close();
        },
        onError: (e: Error) => toast.error(e.message),
    });
    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
            }}
        >
            <div className="grid gap-4 py-2">
                <div className="text-sm text-muted-foreground">
                    {formatDate(job.startedAt)} · {formatDuration(job.durationSec ?? 0)}
                    {job.errorCode
                        ? ` · ${m.history_error_code({ code: job.errorCode, msg: printerErrorText(job.errorCode, job.errorMsg) })}`
                        : ''}
                </div>
                {job.hasSnapshot ? (
                    <img
                        src={api.files.snapshotUrl(printerId, job.id)}
                        alt={m.history_snapshot()}
                        className="max-h-72 w-full rounded-2xl object-contain bg-secondary"
                    />
                ) : (
                    <p className="text-xs text-muted-foreground">{m.history_no_snapshot()}</p>
                )}
                <div className="grid gap-2">
                    <Label htmlFor="failure-reason">{m.history_failure_reason()}</Label>
                    <Select
                        value={reason === '' ? NONE : reason}
                        onValueChange={(v) => setReason(v === NONE ? '' : (v as FailureReason))}
                    >
                        <SelectTrigger id="failure-reason" className="rounded-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>{failureReasonLabel('')}</SelectItem>
                            {FAILURE_REASONS.map((r) => (
                                <SelectItem key={r} value={r}>
                                    {failureReasonLabel(r)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="failure-note">{m.history_failure_note()}</Label>
                    <Input
                        id="failure-note"
                        value={note}
                        maxLength={500}
                        onChange={(e) => setNote(e.target.value)}
                        className="rounded-full px-4"
                    />
                </div>
            </div>
            <DialogFooter className="gap-2">
                <Button type="button" variant="ghost" className="rounded-full" onClick={close}>
                    {m.common_cancel()}
                </Button>
                <Button type="submit" className="rounded-full px-5" disabled={save.isPending}>
                    {m.common_save()}
                </Button>
            </DialogFooter>
        </form>
    );
}
