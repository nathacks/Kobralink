import { createFileRoute, Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { ActivityCard } from '@/components/printer/activity-card';
import { AmsCard } from '@/components/printer/ams/ams-card';
import { AxesCard } from '@/components/printer/axes-card';
import { CameraCard } from '@/components/printer/camera-card';
import { ControlsCard } from '@/components/printer/controls-card';
import { FilesCard } from '@/components/printer/files/files-card';
import { PrintCard } from '@/components/printer/print-card';
import { TemperatureCard } from '@/components/printer/temperature-card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrinterSync } from '@/hooks/use-printers-sync';
import { printerQuery } from '@/lib/queries';
import { usePrinter } from '@/stores/printers';

export const Route = createFileRoute('/_app/printers/$printerId')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(printerQuery(params.printerId)),
    component: PrinterDashboard,
});

function PrinterDashboard() {
    const { printerId } = Route.useParams();
    usePrinterSync(printerId, { events: true });
    const printer = usePrinter(printerId);
    const live = printer?.live;

    if (!printer) return <Skeleton className="h-40 rounded-3xl" />;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 px-2">
                <h2 className="text-xl font-medium">{printer.name}</h2>
                <span className="text-sm text-muted-foreground">
                    {printer.ip} · Moonraker :{printer.httpPort}
                </span>
                <Link
                    to="/printers/$printerId/settings"
                    params={{ printerId }}
                    className="ml-auto flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm hover:bg-accent"
                >
                    <Settings className="size-4" /> Réglages
                </Link>
            </div>

            {live?.connectionError && (
                <div className="rounded-3xl bg-destructive/10 px-5 py-3 text-sm text-destructive">
                    {live.connectionError}
                </div>
            )}

            {!live ? (
                <Skeleton className="h-96 rounded-3xl" />
            ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <ActivityCard printerId={printerId} />
                    </div>
                    <PrintCard printerId={printerId} />
                    <div className="lg:col-span-2">
                        <CameraCard printerId={printerId} />
                    </div>
                    <div className="grid gap-4 lg:col-span-1">
                        <AmsCard printerId={printerId} />
                        <ControlsCard printerId={printerId} />
                    </div>
                    <div className="lg:col-span-2">
                        <FilesCard printerId={printerId} />
                    </div>
                    <div className="lg:col-span-2">
                        <TemperatureCard printerId={printerId} />
                    </div>
                    <AxesCard printerId={printerId} />
                </div>
            )}
        </div>
    );
}
