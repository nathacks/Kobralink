import type { GcodeFileDto } from '@kobralink/shared';
import { ListPlus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { m } from '@/lib/i18n';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export function UploadReadyForm({
    file,
    canPrint,
    onPrint,
    onQueue,
}: {
    file: GcodeFileDto;
    canPrint: boolean;
    onPrint: () => void;
    onQueue: () => void;
}) {
    const close = confirmationDialogStore.actions.closeDialog;
    return (
        <div className="grid gap-4 py-2">
            <div className="flex items-center gap-4 rounded-2xl bg-secondary p-4">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-background/40">
                    {file.thumbnail ? (
                        <img
                            src={`data:image/png;base64,${file.thumbnail}`}
                            alt=""
                            className="size-full object-contain"
                        />
                    ) : (
                        <span className="text-[10px] text-muted-foreground">GCode</span>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate font-medium">{file.filename}</div>
                    <div className="text-xs text-muted-foreground">{m.upload_ready_hint()}</div>
                </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
                <Button type="button" variant="ghost" className="rounded-full" onClick={close}>
                    {m.upload_ready_later()}
                </Button>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-full"
                        onClick={() => {
                            close();
                            onQueue();
                        }}
                    >
                        <ListPlus /> {m.queue_add()}
                    </Button>
                    <Button
                        type="button"
                        className="rounded-full px-5"
                        disabled={!canPrint}
                        onClick={() => {
                            close();
                            onPrint();
                        }}
                    >
                        <Play /> {m.common_print()}
                    </Button>
                </div>
            </DialogFooter>
        </div>
    );
}
