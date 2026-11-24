import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PrinterSettingsForm } from '@/components/printer/settings-form';
import { usePrinter, usePrinterList } from '@/hooks/use-printers';
import { printerQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/printers/$printerId_/settings')({
    loader: ({ context, params }) =>
        context.queryClient.query({ ...printerQuery(params.printerId), staleTime: 'static' }),
    component: PrinterSettings,
});

function PrinterSettings() {
    const { printerId } = Route.useParams();
    const qc = useQueryClient();
    const navigate = useNavigate();
    const printer = usePrinterList().find((p) => p.id === printerId);
    const live = usePrinter(
        printerId,
        (p) => p?.live && { manualOffline: p.live.manualOffline, features: p.live.features },
    );
    if (!printer) return null;
    return (
        <PrinterSettingsForm
            key={printer.id}
            printer={printer}
            live={live}
            onSaved={() => {
                void qc.invalidateQueries({ queryKey: ['printers', printerId] });
                void qc.invalidateQueries({ queryKey: ['printers'], exact: true });
            }}
            onDeleted={() => navigate({ to: '/printers' })}
        />
    );
}
