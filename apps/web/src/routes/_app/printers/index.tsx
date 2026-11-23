import type { FailureReason } from '@kobralink/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { confirmCancel } from '@/components/printer/cancel-print';
import { PrinterCard } from '@/components/printer/printer-card';
import { GettingStarted } from '@/components/printers/getting-started';
import { HOME_STATUSES, homeStatus } from '@/components/printers/printer-status';
import { StatusCounters } from '@/components/printers/status-counters';
import { usePrinters } from '@/hooks/use-printers';
import { useCanOperate } from '@/hooks/use-role';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { printersQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/printers/')({
    validateSearch: z.object({ status: z.enum(HOME_STATUSES).optional().catch(undefined) }),
    beforeLoad: async ({ context, search }) => {
        const printers = await context.queryClient.query({ ...printersQuery, staleTime: 'static' });
        if (printers.length === 1 && !search.status) {
            throw redirect({ to: '/printers/$printerId', params: { printerId: printers[0].id }, replace: true });
        }
    },
    component: PrintersPage,
});

function PrintersPage() {
    const { status } = Route.useSearch();
    const navigate = Route.useNavigate();
    const qc = useQueryClient();
    const printers = usePrinters();
    const canOperate = useCanOperate();
    const onError = (e: Error) => toast.error(e.message);
    const pause = useMutation({
        mutationFn: api.control.pause,
        onSuccess: () => toast.success(m.print_pause_requested()),
        onError,
    });
    const resume = useMutation({
        mutationFn: api.control.resume,
        onSuccess: () => toast.success(m.print_resume_requested()),
        onError,
    });
    const cancel = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: FailureReason | '' }) => api.control.cancel(id, reason),
        onSuccess: () => toast.success(m.print_cancel_requested()),
        onError,
    });
    const light = useMutation({
        mutationFn: ({ id, on }: { id: string; on: boolean }) => api.control.light(id, { on }),
        onError,
    });
    const reconnect = useMutation({
        mutationFn: api.printers.reconnect,
        onSuccess: () => {
            toast.success(m.printers_reconnect_requested());
            void qc.invalidateQueries({ queryKey: ['printers'] });
        },
        onError: (e) => toast.error(e.message),
    });

    if (printers.length === 0) {
        return (
            <div className="grid gap-4">
                <GettingStarted />
                <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-primary/40 p-10 text-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary-strong">
                        <Printer className="size-7" />
                    </div>
                    <h2 className="text-xl font-medium">{m.printers_empty_title()}</h2>
                    <p className="max-w-md text-sm text-muted-foreground">{m.printers_empty_hint()}</p>
                    <AddPrinterDialog />
                </div>
            </div>
        );
    }

    const visible = status ? printers.filter((p) => homeStatus(p) === status) : printers;

    return (
        <div className="grid gap-4">
            <GettingStarted />
            <StatusCounters
                printers={printers}
                active={status}
                onSelect={(next) => navigate({ search: next ? { status: next } : {}, replace: true })}
            />
            {visible.length === 0 && (
                <p className="rounded-3xl bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                    {m.home_filter_empty()}
                </p>
            )}
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {visible.map((p) => (
                    <PrinterCard
                        key={p.id}
                        printer={p}
                        canOperate={canOperate}
                        onPause={() => pause.mutate(p.id)}
                        onResume={() => resume.mutate(p.id)}
                        onCancel={() => confirmCancel((reason) => cancel.mutateAsync({ id: p.id, reason }))}
                        onReconnect={() => reconnect.mutate(p.id)}
                        onLight={(on) => light.mutate({ id: p.id, on })}
                    />
                ))}
            </div>
        </div>
    );
}
