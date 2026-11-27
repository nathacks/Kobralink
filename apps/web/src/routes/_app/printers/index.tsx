import { createFileRoute } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { z } from 'zod';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { PrinterCard } from '@/components/printer/printer-card';
import { GettingStarted } from '@/components/printers/getting-started';
import { HOME_STATUSES, homeStatus } from '@/components/printers/printer-status';
import { StatusCounters } from '@/components/printers/status-counters';
import { usePrinterCardActions } from '@/hooks/use-printer-card-actions';
import { usePrinters } from '@/hooks/use-printers';
import { useCanOperate } from '@/hooks/use-role';
import { m } from '@/lib/i18n';

export const Route = createFileRoute('/_app/printers/')({
    validateSearch: z.object({ status: z.enum(HOME_STATUSES).optional().catch(undefined) }),
    component: PrintersPage,
});

function PrintersPage() {
    const { status } = Route.useSearch();
    const navigate = Route.useNavigate();
    const printers = usePrinters();
    const canOperate = useCanOperate();
    const actions = usePrinterCardActions();

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
                    <PrinterCard key={p.id} printer={p} canOperate={canOperate} {...actions} />
                ))}
            </div>
        </div>
    );
}
