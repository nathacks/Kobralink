import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FilamentProfilesCard } from '@/components/printer/filament-profiles-card';
import { PrinterSettingsForm } from '@/components/printer/settings-form';
import { usePrinterSync } from '@/hooks/use-printers-sync';
import { printerQuery } from '@/lib/queries';
import { usePrinter } from '@/stores/printers';

export const Route = createFileRoute('/_app/printers/$printerId_/settings')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(printerQuery(params.printerId)),
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
        <div className="max-w-2xl space-y-4">
            <PrinterSettingsForm
                key={printer.id}
                printer={printer}
                onSaved={() => qc.invalidateQueries({ queryKey: ['printers'] })}
                onDeleted={() => navigate({ to: '/printers' })}
            />
            <FilamentProfilesCard />
        </div>
    );
}
