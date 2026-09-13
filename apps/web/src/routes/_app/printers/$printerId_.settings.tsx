import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PrinterSettingsForm } from '@/components/printer/settings-form';
import { printerQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/printers/$printerId_/settings')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(printerQuery(params.printerId)),
    component: PrinterSettings,
});

function PrinterSettings() {
    const { printerId } = Route.useParams();
    const qc = useQueryClient();
    const navigate = useNavigate();
    const { data: printer } = useQuery(printerQuery(printerId));
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
