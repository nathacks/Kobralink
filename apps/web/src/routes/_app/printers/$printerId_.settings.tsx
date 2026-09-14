import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PrinterSettingsForm } from '@/components/printer/settings-form';
import { usePrinter } from '@/hooks/use-printers';
import { usePrinterSync } from '@/hooks/use-printers-sync';
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
    usePrinterSync(printerId);
    const printer = usePrinter(printerId);
    if (!printer) return null;
    return (
        <PrinterSettingsForm
            key={printer.id}
            printer={printer}
            onSaved={() => qc.invalidateQueries({ queryKey: ['printers'] })}
            onDeleted={() => navigate({ to: '/printers' })}
        />
    );
}
