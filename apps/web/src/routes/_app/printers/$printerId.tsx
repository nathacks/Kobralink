import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { RefreshCw, Settings, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AmsCard } from '@/components/printer/ams/ams-card';
import { BalancedColumns } from '@/components/printer/balanced-columns';
import { CameraCard } from '@/components/printer/camera-card';
import { ControlsCard } from '@/components/printer/controls-card';
import { FilesCard } from '@/components/printer/files/files-card';
import { MacrosCard } from '@/components/printer/macros-card';
import { MaintenanceCard } from '@/components/printer/maintenance-card';
import { PrintCard } from '@/components/printer/print-card';
import { QueueCard } from '@/components/printer/queue-card';
import { StatusBadge } from '@/components/printer/status-badge';
import { TemperatureCard } from '@/components/printer/temperature-card';
import { GettingStarted } from '@/components/printers/getting-started';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrinter } from '@/hooks/use-printers';
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
    const status = usePrinter(printerId, (p) =>
        !p ? 'unknown' : !p.live ? 'loading' : p.live.connected ? 'online' : 'offline',
    );
    const canOperate = useCanOperate();

    if (status === 'unknown') return <Skeleton className="h-40 rounded-3xl" />;

    if (status === 'loading') {
        return (
            <div className="space-y-4">
                <DashboardHeader printerId={printerId} />
                <Skeleton className="h-96 rounded-3xl" />
            </div>
        );
    }

    if (status === 'offline') {
        return (
            <div className="space-y-4">
                <DashboardHeader printerId={printerId} />
                <OfflinePanel key={printerId} printerId={printerId} />
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
            <DashboardHeader printerId={printerId} />
            <fieldset
                key={printerId}
                disabled={!canOperate}
                className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]"
                data-testid="printer-dashboard"
            >
                <BalancedColumns
                    left={
                        <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[max(20rem,30%)_minmax(0,1fr)] @4xl:grid-rows-[auto_1fr]">
                            <CameraCard printerId={printerId} className="@4xl:col-start-2" />
                            <TemperatureCard
                                printerId={printerId}
                                className="@4xl:col-start-1 @4xl:row-span-2 @4xl:row-start-1"
                            />
                            <QueueCard printerId={printerId} className="@4xl:col-start-2" />
                        </div>
                    }
                    right={
                        <>
                            <PrintCard printerId={printerId} />
                            <ControlsCard printerId={printerId} />
                        </>
                    }
                    cards={[
                        { key: 'ams', side: 'right', node: <AmsCard printerId={printerId} /> },
                        { key: 'macros', node: <MacrosCard printerId={printerId} /> },
                        { key: 'maintenance', node: <MaintenanceCard printerId={printerId} /> },
                        { key: 'files', side: 'left', node: <FilesCard printerId={printerId} /> },
                    ]}
                />
            </fieldset>
            <GettingStarted />
        </div>
    );
}

function DashboardHeader({ printerId }: { printerId: string }) {
    const printer = usePrinter(printerId);
    if (!printer) return null;
    const live = printer.live;
    const firmware = live && live.firmwareVersion !== 'unknown' ? live.firmwareVersion : null;
    return (
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-1">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="truncate text-2xl font-medium">{printer.name}</h2>
                    {live && <StatusBadge state={live} />}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    {m.dashboard_moonraker({ ip: printer.ip, port: printer.httpPort })}
                    {firmware && ` · ${m.activity_firmware()} ${firmware}`}
                </p>
            </div>
            <Button asChild variant="secondary" className="h-9 rounded-full">
                <Link to="/printers/$printerId/settings" params={{ printerId }} aria-label={m.common_settings()}>
                    <Settings /> <span className="hidden sm:inline">{m.common_settings()}</span>
                </Link>
            </Button>
        </header>
    );
}

function OfflinePanel({ printerId }: { printerId: string }) {
    const connectionError = usePrinter(printerId, (p) => p?.live?.connectionError);
    const canOperate = useCanOperate();
    const qc = useQueryClient();
    const [cooldown, setCooldown] = useState(false);
    const reconnect = useMutation({
        mutationFn: () => api.printers.reconnect(printerId),
        onSuccess: () => {
            toast.success(m.printers_reconnect_requested());
            setCooldown(true);
            void qc.invalidateQueries({ queryKey: ['printers'], exact: true });
        },
    });
    const reconnecting = reconnect.isPending || cooldown;

    useEffect(() => {
        if (!cooldown) return;
        const t = setTimeout(() => setCooldown(false), RECONNECT_COOLDOWN_MS);
        return () => clearTimeout(t);
    }, [cooldown]);

    return (
        <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-destructive/40 p-10 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <WifiOff className="size-8" />
            </div>
            <div className="space-y-1">
                <p className="text-lg font-medium">{m.common_printer_offline()}</p>
                {connectionError && (
                    <p className="text-sm text-muted-foreground">{connectionErrorText(connectionError)}</p>
                )}
            </div>
            {canOperate && (
                <Button size="lg" className="rounded-full" disabled={reconnecting} onClick={() => reconnect.mutate()}>
                    <RefreshCw className={cn('size-4', reconnecting && 'animate-spin')} />
                    {m.printers_reconnect()}
                </Button>
            )}
        </div>
    );
}
