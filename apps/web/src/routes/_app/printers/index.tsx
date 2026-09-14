import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Ban, Pause, Play, Printer, RefreshCw, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { StatusBadge } from '@/components/printer/status-badge';
import { Ring } from '@/components/viz/ring';
import { usePrinters } from '@/hooks/use-printers';
import { useCanOperate } from '@/hooks/use-role';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { connectionErrorText } from '@/lib/labels';
import { printersQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export const Route = createFileRoute('/_app/printers/')({
    loader: ({ context }) => context.queryClient.query({ ...printersQuery, staleTime: 'static' }),
    component: PrintersPage,
});

function PrintersPage() {
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
        mutationFn: api.control.cancel,
        onSuccess: () => toast.success(m.print_cancel_requested()),
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
            <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-primary/40 p-10 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Printer className="size-7" />
                </div>
                <h2 className="text-xl font-medium">{m.printers_empty_title()}</h2>
                <p className="max-w-md text-sm text-muted-foreground">{m.printers_empty_hint()}</p>
                <AddPrinterDialog />
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {printers.map((p) => {
                const live = p.live;
                const printing = live?.printState === 'printing' || live?.printState === 'paused';
                return (
                    <section
                        key={p.id}
                        className={cn(
                            'group relative flex flex-col gap-5 rounded-3xl p-6 transition-colors duration-150',
                            printing
                                ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                                : 'bg-card text-card-foreground hover:bg-accent',
                        )}
                    >
                        <Link
                            to="/printers/$printerId"
                            params={{ printerId: p.id }}
                            aria-label={`${m.common_open()} ${p.name}`}
                            className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                        <div className="relative z-10 flex items-start justify-between gap-3 pointer-events-none">
                            <div className="min-w-0">
                                <h2 className="truncate text-lg font-medium">{p.name}</h2>
                                <p
                                    className={cn(
                                        'text-sm',
                                        printing ? 'text-primary-foreground/70' : 'text-muted-foreground',
                                    )}
                                >
                                    {p.model} · {p.ip}
                                </p>
                            </div>
                            <Link
                                to="/printers/$printerId"
                                params={{ printerId: p.id }}
                                title={m.common_open()}
                                aria-label={m.common_open()}
                                className={cn(
                                    'pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
                                    printing
                                        ? 'bg-primary-foreground/15 group-hover:bg-primary-foreground/30'
                                        : 'bg-secondary group-hover:bg-primary group-hover:text-primary-foreground',
                                )}
                            >
                                <ArrowUpRight className="size-4" />
                            </Link>
                        </div>

                        {printing && <Snapshot printerId={p.id} />}
                        <div className="flex items-center gap-5">
                            {printing && live ? (
                                <Ring
                                    value={live.progress}
                                    size={88}
                                    stroke={10}
                                    className="text-primary-foreground"
                                    trackClassName="text-primary-foreground/20"
                                >
                                    <span className="text-lg font-semibold tabular-nums">
                                        {Math.round(live.progress * 100)}%
                                    </span>
                                </Ring>
                            ) : (
                                <div className="flex size-22 items-center justify-center rounded-3xl bg-secondary">
                                    <Printer className="size-8 text-muted-foreground" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-1 text-sm">
                                {live && !printing && (
                                    <StatusBadge
                                        state={live}
                                        className={printing ? 'bg-primary-foreground/15 text-primary-foreground' : ''}
                                    />
                                )}
                                {printing && live ? (
                                    <>
                                        <div className="truncate font-medium" title={live.filename}>
                                            {live.filename}
                                        </div>
                                        <div className="text-primary-foreground/80">
                                            {m.printers_remaining({ duration: formatDuration(live.remainTimeSec) })}
                                        </div>
                                        <div className="text-primary-foreground/80">
                                            {Math.round(live.nozzleTemp)}° / {Math.round(live.bedTemp)}°
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-muted-foreground">
                                            {m.printers_temps({
                                                nozzle: Math.round(live?.nozzleTemp ?? 0),
                                                bed: Math.round(live?.bedTemp ?? 0),
                                            })}
                                        </div>
                                        {live?.connectionError && (
                                            <div className="text-destructive">
                                                {connectionErrorText(live.connectionError)}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div
                            className={cn(
                                'relative z-10 flex items-center justify-between text-xs pointer-events-none',
                                printing ? 'text-primary-foreground/70' : 'text-muted-foreground',
                            )}
                        >
                            <code>
                                {window.location.hostname}:{p.httpPort}
                            </code>
                            <div className="pointer-events-auto flex gap-1">
                                {printing && live && canOperate && (
                                    <>
                                        {live.printState === 'printing' ? (
                                            <SmallButton
                                                onClick={() => pause.mutate(p.id)}
                                                title={m.common_pause()}
                                                inverse
                                            >
                                                <Pause />
                                            </SmallButton>
                                        ) : (
                                            <SmallButton
                                                onClick={() => resume.mutate(p.id)}
                                                title={m.common_resume()}
                                                inverse
                                            >
                                                <Play />
                                            </SmallButton>
                                        )}
                                        <SmallButton
                                            onClick={() =>
                                                alertConfirmationDialogStore.actions.openAlertDialog({
                                                    title: m.print_cancel_title(),
                                                    description: m.print_cancel_hint(),
                                                    actionLabel: m.print_cancel_action(),
                                                    cancelLabel: m.print_cancel_keep(),
                                                    onAction: () => cancel.mutateAsync(p.id),
                                                })
                                            }
                                            title={m.common_cancel()}
                                            inverse
                                        >
                                            <Ban />
                                        </SmallButton>
                                    </>
                                )}
                                <SmallButton
                                    onClick={() => reconnect.mutate(p.id)}
                                    title={m.printers_reconnect()}
                                    inverse={printing}
                                >
                                    <RefreshCw />
                                </SmallButton>
                                <Link
                                    to="/printers/$printerId/settings"
                                    params={{ printerId: p.id }}
                                    title={m.common_settings()}
                                    aria-label={m.common_settings()}
                                    className={cn(
                                        'flex size-8 items-center justify-center rounded-full [&_svg]:size-3.5',
                                        printing
                                            ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
                                            : 'bg-secondary hover:bg-accent',
                                    )}
                                >
                                    <Settings />
                                </Link>
                            </div>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function SmallButton({ inverse, className, ...props }: React.ComponentProps<'button'> & { inverse?: boolean }) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                'flex size-8 items-center justify-center rounded-full [&_svg]:size-3.5',
                inverse ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25' : 'bg-secondary hover:bg-accent',
                className,
            )}
        />
    );
}

function Snapshot({ printerId }: { printerId: string }) {
    const [tick, setTick] = useState(() => Date.now());
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const t = setInterval(() => {
            setTick(Date.now());
            setFailed(false);
        }, 5000);
        return () => clearInterval(t);
    }, []);
    return (
        <div
            className={cn(
                'relative z-10 -mt-1 aspect-video w-full overflow-hidden rounded-2xl bg-primary-foreground/10 pointer-events-none',
                failed && 'hidden',
            )}
        >
            <img
                src={`${api.camera.snapshotUrl(printerId)}?t=${tick}`}
                alt=""
                className="size-full object-cover"
                onError={() => setFailed(true)}
            />
        </div>
    );
}
