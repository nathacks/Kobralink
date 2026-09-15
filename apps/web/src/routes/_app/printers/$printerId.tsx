import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { RefreshCw, Settings, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrinter } from '@/hooks/use-printers';
import { usePrinterSync } from '@/hooks/use-printers-sync';
import { useCanOperate } from '@/hooks/use-role';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { connectionErrorText } from '@/lib/labels';
import { printerQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const RECONNECT_COOLDOWN_MS = 30000;

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
    const qc = useQueryClient();
    const [reconnectCooldown, setReconnectCooldown] = useState(false);
    const reconnect = useMutation({
        mutationFn: () => api.printers.reconnect(printerId),
        onSuccess: () => {
            toast.success(m.printers_reconnect_requested());
            setReconnectCooldown(true);
            void qc.invalidateQueries({ queryKey: ['printers'] });
        },
        onError: (e: Error) => toast.error(e.message),
    });

    useEffect(() => {
        if (!reconnectCooldown) return;
        const t = setTimeout(() => setReconnectCooldown(false), RECONNECT_COOLDOWN_MS);
        return () => clearTimeout(t);
    }, [reconnectCooldown]);

    useEffect(() => {
        if (live?.connected) setReconnectCooldown(false);
    }, [live?.connected]);

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

    if (!live.connected) {
        const reconnecting = reconnect.isPending || reconnectCooldown;
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 px-2">{header}</div>
                <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-destructive/40 p-10 text-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                        <WifiOff className="size-8" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-medium">{m.common_printer_offline()}</p>
                        {live.connectionError && (
                            <p className="text-sm text-muted-foreground">{connectionErrorText(live.connectionError)}</p>
                        )}
                    </div>
                    {canOperate && (
                        <Button
                            size="lg"
                            className="rounded-full"
                            disabled={reconnecting}
                            onClick={() => reconnect.mutate()}
                        >
                            <RefreshCw className={cn('size-4', reconnecting && 'animate-spin')} />
                            {m.printers_reconnect()}
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
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
