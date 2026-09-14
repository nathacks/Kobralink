import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Pause, Play, Scissors, X } from 'lucide-react';
import { SkipObjectsForm } from '@/components/printer/skip/skip-objects-form';
import { Ring } from '@/components/viz/ring';
import { usePrinterAction } from '@/hooks/use-printer-action';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useAlertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { useConfirmationDialogStore } from '@/stores/confirmation-dialog';
import { useLiveState } from '@/stores/printers';

export function PrintCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const qc = useQueryClient();
    const openAlertDialog = useAlertConfirmationDialogStore((s) => s.openAlertDialog);
    const openDialog = useConfirmationDialogStore((s) => s.openDialog);
    const pause = usePrinterAction(printerId, api.control.pause, m.print_pause_requested);
    const resume = usePrinterAction(printerId, api.control.resume, m.print_resume_requested);
    const cancel = usePrinterAction(printerId, api.control.cancel, m.print_cancel_requested);
    const clearReady = useMutation({
        mutationFn: () => api.control.clearFileReady(printerId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['printers', printerId, 'state'] }),
    });

    const printing = state.printState === 'printing';
    const paused = state.printState === 'paused';
    const active = printing || paused;
    const pct = Math.round(state.progress * 100);
    const remaining =
        state.remainTimeSec || (state.slicerTimeSec ? Math.max(0, state.slicerTimeSec - state.printDurationSec) : 0);

    return (
        <section
            className={cn(
                'flex flex-col rounded-3xl p-6',
                active ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground',
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg font-medium">{m.print_title()}</h2>
                    <p
                        className={cn(
                            'truncate text-sm',
                            active ? 'text-primary-foreground/70' : 'text-muted-foreground',
                        )}
                    >
                        {state.filename || (state.connected ? m.print_none() : m.common_printer_offline())}
                    </p>
                </div>
                {active && (
                    <div className="flex shrink-0 gap-2">
                        <CircleButton
                            title={m.print_skip_objects()}
                            onClick={() =>
                                openDialog({
                                    title: m.print_skip_objects(),
                                    description: m.print_skip_objects_hint(),
                                    content: <SkipObjectsForm printerId={printerId} />,
                                })
                            }
                        >
                            <Scissors />
                        </CircleButton>
                        {printing ? (
                            <CircleButton
                                title={m.common_pause()}
                                onClick={() => pause.mutate()}
                                disabled={pause.isPending}
                            >
                                <Pause />
                            </CircleButton>
                        ) : (
                            <CircleButton
                                title={m.common_resume()}
                                onClick={() => resume.mutate()}
                                disabled={resume.isPending}
                            >
                                <Play />
                            </CircleButton>
                        )}
                        <CircleButton
                            title={m.common_cancel()}
                            onClick={() =>
                                openAlertDialog({
                                    title: m.print_cancel_title(),
                                    description: m.print_cancel_hint(),
                                    actionLabel: m.print_cancel_action(),
                                    cancelLabel: m.print_cancel_keep(),
                                    onAction: () => cancel.mutateAsync(),
                                })
                            }
                            disabled={cancel.isPending}
                        >
                            <Ban />
                        </CircleButton>
                    </div>
                )}
            </div>

            <div className="my-6 flex items-center justify-center">
                {active ? (
                    <Ring
                        value={state.progress}
                        size={150}
                        stroke={14}
                        className="text-primary-foreground"
                        trackClassName="text-primary-foreground/20"
                    >
                        <div className="text-center">
                            <div className="text-3xl font-semibold tabular-nums">{pct}%</div>
                            <div className="text-xs text-primary-foreground/70">
                                {paused ? m.print_paused() : m.print_in_progress()}
                            </div>
                        </div>
                    </Ring>
                ) : (
                    <div className="flex size-36 items-center justify-center overflow-hidden rounded-3xl bg-secondary">
                        {state.thumbnail ? (
                            <img
                                src={`data:image/png;base64,${state.thumbnail}`}
                                alt=""
                                className="size-full object-contain"
                            />
                        ) : (
                            <span className="text-xs text-muted-foreground">{m.print_preview()}</span>
                        )}
                    </div>
                )}
            </div>

            <dl
                className={cn(
                    'mt-auto grid grid-cols-3 gap-2 text-sm',
                    active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
            >
                <Kv k={m.print_elapsed()} v={active ? formatDuration(state.printDurationSec) : '—'} strong={active} />
                <Kv k={m.print_remaining()} v={active ? formatDuration(remaining) : '—'} strong={active} />
                <Kv
                    k={m.print_layer()}
                    v={state.totalLayers ? `${state.currLayer}/${state.totalLayers}` : '—'}
                    strong={active}
                />
            </dl>

            {state.fileReady && !active && (
                <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-primary/15 px-4 py-2 text-sm">
                    <span className="truncate">
                        <strong>{state.fileReady}</strong> {m.print_file_ready()}
                    </span>
                    <button
                        type="button"
                        className="rounded-full p-1 hover:bg-primary/20"
                        onClick={() => clearReady.mutate()}
                        aria-label={m.common_close()}
                    >
                        <X className="size-4" />
                    </button>
                </div>
            )}
            {state.pauseMsg && (
                <div className="mt-4 rounded-2xl bg-destructive/15 px-4 py-2 text-sm text-destructive">
                    [{state.errorCode}] {state.pauseMsg}
                </div>
            )}
        </section>
    );
}

function Kv({ k, v, strong }: { k: string; v: string; strong: boolean }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide">{k}</dt>
            <dd className={cn('tabular-nums', strong ? 'text-primary-foreground' : 'text-foreground')}>{v}</dd>
        </div>
    );
}

function CircleButton(props: React.ComponentProps<'button'>) {
    return (
        <button
            type="button"
            {...props}
            className="flex size-10 items-center justify-center rounded-full bg-primary-foreground/15 text-primary-foreground transition-colors hover:bg-primary-foreground/25 disabled:opacity-50 [&_svg]:size-4"
        />
    );
}
