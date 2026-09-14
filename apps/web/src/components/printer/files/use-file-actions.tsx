import type { GcodeFileDto } from '@kobralink/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { PrePrintSkipForm } from '@/components/printer/skip/preprint-skip-form';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { UploadReadyForm } from './upload-ready-form';

const isGcode = (f: File) => /\.(gcode|bgcode)$/i.test(f.name);

export function useFileActions(printerId: string) {
    const state = useLiveState(printerId);
    const printer = usePrinter(printerId);
    const qc = useQueryClient();
    const [uploadingCount, setUploadingCount] = useState(0);
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
    const remove = useMutation({
        mutationFn: (fileId: string) => api.files.remove(printerId, fileId),
        onSuccess: invalidate,
        onError: (e) => toast.error(e.message),
    });
    const upload = useMutation({
        mutationFn: (file: File) => api.files.upload(printerId, file, false),
        onSuccess: invalidate,
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

    const requestDelete = (f: GcodeFileDto) =>
        openAlertDialog({
            title: m.files_delete_title({ name: f.filename }),
            description: m.files_delete_hint(),
            actionLabel: m.common_delete(),
            onAction: () => remove.mutateAsync(f.id),
        });

    const uploadMany = async (dropped: FileList | null) => {
        const accepted = Array.from(dropped ?? []).filter(isGcode);
        if (!accepted.length) {
            if (dropped?.length) toast.error(m.files_drop_invalid());
            return;
        }
        setUploadingCount(accepted.length);
        const uploaded: GcodeFileDto[] = [];
        try {
            for (const file of accepted) {
                await upload
                    .mutateAsync(file)
                    .then((res) => uploaded.push(res))
                    .catch(() => undefined);
            }
        } finally {
            setUploadingCount(0);
        }
        if (uploaded.length > 1) {
            toast.success(m.files_added_many({ count: uploaded.length }));
            return;
        }
        const single = uploaded[0];
        if (!single) return;
        if (printer?.settings.printStartDialog ?? true) {
            openDialog({
                title: m.files_added({ name: single.filename }),
                content: (
                    <UploadReadyForm
                        file={single}
                        canPrint={canPrint}
                        onPrint={() => requestPrint(single)}
                        onQueue={() => enqueue.mutate({ fileId: single.id })}
                    />
                ),
            });
        } else {
            toast.success(m.files_added({ name: single.filename }), {
                action: canPrint ? { label: m.common_print(), onClick: () => requestPrint(single) } : undefined,
            });
        }
    };

    return {
        connected: state.connected,
        canPrint: canPrint && !print.isPending,
        isUploading: upload.isPending || uploadingCount > 0,
        uploadingCount,
        requestPrint,
        requestDelete,
        enqueue: (f: GcodeFileDto) => enqueue.mutate({ fileId: f.id }),
        uploadMany,
    };
}
