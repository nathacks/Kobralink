import type { FailureReason } from '@kobralink/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { confirmCancel } from '@/components/printer/cancel-print';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

export interface PrinterCardActions {
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onCancel: (id: string) => void;
    onReconnect: (id: string) => void;
    onLight: (id: string, on: boolean) => void;
}

export function usePrinterCardActions(): PrinterCardActions {
    const qc = useQueryClient();
    const { mutate: pause } = useMutation({
        mutationFn: (id: string) => api.control.pause(id),
        onSuccess: () => toast.success(m.print_pause_requested()),
    });
    const { mutate: resume } = useMutation({
        mutationFn: (id: string) => api.control.resume(id),
        onSuccess: () => toast.success(m.print_resume_requested()),
    });
    const { mutateAsync: cancel } = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: FailureReason | '' }) => api.control.cancel(id, reason),
        onSuccess: () => toast.success(m.print_cancel_requested()),
    });
    const { mutate: light } = useMutation({
        mutationFn: ({ id, on }: { id: string; on: boolean }) => api.control.light(id, { on }),
    });
    const { mutate: reconnect } = useMutation({
        mutationFn: (id: string) => api.printers.reconnect(id),
        onSuccess: () => {
            toast.success(m.printers_reconnect_requested());
            void qc.invalidateQueries({ queryKey: ['printers'], exact: true });
        },
    });
    return useMemo(
        () => ({
            onPause: (id) => pause(id),
            onResume: (id) => resume(id),
            onCancel: (id) => confirmCancel((reason) => cancel({ id, reason })),
            onReconnect: (id) => reconnect(id),
            onLight: (id, on) => light({ id, on }),
        }),
        [pause, resume, cancel, reconnect, light],
    );
}
