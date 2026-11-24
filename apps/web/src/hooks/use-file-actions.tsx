import type { AddQueueItemInput, GcodeFileDto, SchedulePrintInput, StartPrintInput } from '@kobralink/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { PrintReadyForm } from '@/components/printer/files/print-ready-form';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { parseFilename } from '@/lib/filename';
import { formatDate } from '@/lib/format';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

const isGcode = (f: File) => /\.(gcode|bgcode)$/i.test(f.name);

export function useFileActions(printerId: string) {
    const { connected, printState } = useLiveState(printerId, ({ connected, printState }) => ({
        connected,
        printState,
    }));
    const settings = usePrinter(printerId, (p) => p?.settings);
    const qc = useQueryClient();
    const [uploadingCount, setUploadingCount] = useState(0);
    const openAlertDialog = alertConfirmationDialogStore.actions.openAlertDialog;
    const openDialog = confirmationDialogStore.actions.openDialog;
    const busy = printState === 'printing' || printState === 'paused';
    const canPrint = connected && !busy;

    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'files'] });
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'history'] });
    };
    const enqueue = useMutation({
        mutationFn: (input: AddQueueItemInput) => api.queue.add(input),
        onSuccess: (item) => {
            toast.success(m.queue_added({ name: item.filename }));
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'queue'] });
            void qc.invalidateQueries({ queryKey: ['queue'] });
        },
    });
    const print = useMutation({
        mutationFn: (input: StartPrintInput) => api.files.print(printerId, input),
        onSuccess: (f) => {
            toast.success(m.files_print_started({ name: f.filename }));
            invalidate();
        },
    });
    const schedule = useMutation({
        mutationFn: (input: SchedulePrintInput) => api.schedule.create(printerId, input),
        onSuccess: (item) => {
            toast.success(m.schedule_added({ name: item.filename, date: formatDate(item.startAt) }));
            void qc.invalidateQueries({ queryKey: ['printers', printerId, 'schedule'] });
        },
    });
    const remove = useMutation({
        mutationFn: (fileId: string) => api.files.remove(printerId, fileId),
        onSuccess: invalidate,
    });
    const upload = useMutation({
        mutationFn: (file: File) => api.files.upload(printerId, file, false),
        onSuccess: invalidate,
    });

    const openPrintDialog = (f: GcodeFileDto, withQueue: boolean) =>
        openDialog({
            title: m.files_print_title({ name: parseFilename(f.filename).name }),
            props: { className: 'sm:max-w-5xl' },
            description: m.print_ready_hint(),
            content: (
                <PrintReadyForm
                    printerId={printerId}
                    file={f}
                    onPrint={async (r) => {
                        if (f.webUnverified) await api.files.verify(printerId, f.id).catch(() => undefined);
                        return print.mutateAsync({ fileId: f.id, ...r });
                    }}
                    onQueue={withQueue ? (r, target) => enqueue.mutate({ fileId: f.id, ...r, ...target }) : undefined}
                    onSchedule={async (r, startAt) => {
                        if (f.webUnverified) await api.files.verify(printerId, f.id).catch(() => undefined);
                        return schedule.mutateAsync({ fileId: f.id, startAt, ...r });
                    }}
                />
            ),
        });

    const requestPrint = (f: GcodeFileDto) => {
        const go = () => openPrintDialog(f, false);
        if (f.webUnverified && (settings?.webUploadWarning ?? true)) {
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
        if (settings?.printStartDialog ?? true) {
            openPrintDialog(single, true);
        } else {
            toast.success(m.files_added({ name: single.filename }), {
                action: canPrint ? { label: m.common_print(), onClick: () => requestPrint(single) } : undefined,
            });
        }
    };

    return {
        connected,
        canPrint: canPrint && !print.isPending,
        isUploading: upload.isPending || uploadingCount > 0,
        uploadingCount,
        requestPrint,
        requestDelete,
        enqueue: (f: GcodeFileDto) => enqueue.mutate({ fileId: f.id, printerId }),
        uploadMany,
    };
}
