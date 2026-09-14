import { createFileRoute, Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { DashboardGrid } from '@/components/dashboard/dashboard-grid';
import type { WidgetId } from '@/components/dashboard/layout-store';
import { ActivityCard } from '@/components/printer/activity-card';
import { AmsCard } from '@/components/printer/ams/ams-card';
import { AxesCard } from '@/components/printer/axes-card';
import { CameraCard } from '@/components/printer/camera-card';
import { ControlsCard } from '@/components/printer/controls-card';
import { FilesCard } from '@/components/printer/files/files-card';
import { MacrosCard } from '@/components/printer/macros-card';
import { PrintCard } from '@/components/printer/print-card';
import { QueueCard } from '@/components/printer/queue-card';
import { TemperatureCard } from '@/components/printer/temperature-card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrinter } from '@/hooks/use-printers';
import { usePrinterSync } from '@/hooks/use-printers-sync';
import { useCanOperate } from '@/hooks/use-role';
import { m } from '@/lib/i18n';
import { connectionErrorText } from '@/lib/labels';
import { printerQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/printers/$printerId')({
    loader: ({ context, params }) =>
        context.queryClient.query({ ...printerQuery(params.printerId), staleTime: 'static' }),
    component: PrinterDashboard,
});

function PrinterDashboard() {
    const { printerId } = Route.useParams();
    usePrinterSync(printerId, { events: true });
    const printer = usePrinter(printerId);
    const live = printer?.live;
    const canOperate = useCanOperate();

    if (!printer) return <Skeleton className="h-40 rounded-3xl" />;

    const widgets: Record<WidgetId, () => React.ReactNode> = {
        activity: () => <ActivityCard printerId={printerId} />,
        print: () => <PrintCard printerId={printerId} />,
        camera: () => <CameraCard printerId={printerId} />,
        ams: () => <AmsCard printerId={printerId} />,
        controls: () => <ControlsCard printerId={printerId} />,
        files: () => <FilesCard printerId={printerId} />,
        axes: () => <AxesCard printerId={printerId} />,
        temperature: () => <TemperatureCard printerId={printerId} />,
        queue: () => <QueueCard printerId={printerId} />,
        macros: () => <MacrosCard printerId={printerId} />,
    };

    const header = (
        <>
            <h2 className="text-xl font-medium">{printer.name}</h2>
            <span className="text-sm text-muted-foreground">
                {m.dashboard_moonraker({ ip: printer.ip, port: printer.httpPort })}
            </span>
            <Link
                to="/printers/$printerId/settings"
                params={{ printerId }}
                className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm hover:bg-accent"
            >
                <Settings className="size-4" /> {m.common_settings()}
            </Link>
        </>
    );

    if (!live) {
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 px-2">{header}</div>
                <Skeleton className="h-96 rounded-3xl" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {live.connectionError && (
                <div className="rounded-3xl bg-destructive/10 px-5 py-3 text-sm text-destructive">
                    {connectionErrorText(live.connectionError)}
                </div>
            )}
            {!canOperate && (
                <div className="rounded-3xl bg-secondary px-5 py-3 text-sm text-muted-foreground">
                    {m.role_viewer_hint()}
                </div>
            )}
            <fieldset disabled={!canOperate} className="contents">
                <DashboardGrid printerId={printerId} header={header} render={(id) => widgets[id]()} />
            </fieldset>
        </div>
    );
}
