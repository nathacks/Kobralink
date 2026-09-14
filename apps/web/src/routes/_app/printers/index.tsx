import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Printer, RefreshCw, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { StatusBadge } from '@/components/printer/status-badge';
import { Ring } from '@/components/viz/ring';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { connectionErrorText } from '@/lib/labels';
import { printersQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { usePrinters } from '@/stores/printers';

export const Route = createFileRoute('/_app/printers/')({
    loader: ({ context }) => context.queryClient.query({ ...printersQuery, staleTime: 'static' }),
    component: PrintersPage,
});

function PrintersPage() {
    const qc = useQueryClient();
    const printers = usePrinters();
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
                            'flex flex-col gap-5 rounded-3xl p-6',
                            printing ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground',
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
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
                                    'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
                                    printing
                                        ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
                                        : 'bg-secondary hover:bg-accent',
                                )}
                            >
                                <ArrowUpRight className="size-4" />
                            </Link>
                        </div>

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
                                'flex items-center justify-between text-xs',
                                printing ? 'text-primary-foreground/70' : 'text-muted-foreground',
                            )}
                        >
                            <code>
                                {window.location.hostname}:{p.httpPort}
                            </code>
                            <div className="flex gap-1">
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
