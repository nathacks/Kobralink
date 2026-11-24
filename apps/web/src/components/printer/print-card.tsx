import { type FailureReason, type GcodeFileDto, isCalibrating } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Box, Pause, Play, Scissors, X } from 'lucide-react';
import { toast } from 'sonner';
import { confirmCancel } from '@/components/printer/cancel-print';
import { GcodePreview } from '@/components/printer/files/gcode-preview';
import { openPrintReadyDialog } from '@/components/printer/print-ready-watcher';
import { SkipObjectsForm } from '@/components/printer/skip/skip-objects-form';
import { useParsedGcode } from '@/hooks/use-parsed-gcode';
import { usePrintClock } from '@/hooks/use-print-clock';
import { usePrinterAction } from '@/hooks/use-printer-action';
import { useLiveState } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { parseFilename } from '@/lib/filename';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { kobraStateLabel, printerErrorText } from '@/lib/labels';
import { filesQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export function PrintCard({ printerId, className }: { printerId: string; className?: string }) {
    const state = useLiveState(printerId, (s) => ({
        connected: s.connected,
        printState: s.printState,
        kobraState: s.kobraState,
        currLayer: s.currLayer,
        totalLayers: s.totalLayers,
        pct: Math.round(s.progress * 100),
        filename: s.filename,
        thumbnail: s.thumbnail,
        fileReady: s.fileReady,
        errorCode: s.errorCode,
        pauseMsg: s.pauseMsg,
    }));
    const openDialog = confirmationDialogStore.actions.openDialog;

    const pause = usePrinterAction(printerId, api.control.pause, m.print_pause_requested);
    const resume = usePrinterAction(printerId, api.control.resume, m.print_resume_requested);
    const cancel = useMutation({
        mutationFn: (reason: FailureReason | '') => api.control.cancel(printerId, reason),
        onSuccess: () => toast.success(m.print_cancel_requested()),
    });

    const printing = state.printState === 'printing';
    const paused = state.printState === 'paused';
    const calibrating = isCalibrating(state);
    const active = printing || paused;
    const files = useQuery({ ...filesQuery(printerId), enabled: active });
    const liveFile = active ? files.data?.find((f) => f.filename === state.filename) : undefined;

    const qc = useQueryClient();
    const clearReady = useMutation({ mutationFn: () => api.control.clearFileReady(printerId) });

    const thumbnail = liveFile?.thumbnail || state.thumbnail;
    const title = active && state.filename ? parseFilename(state.filename) : null;
    const openPreview = liveFile
        ? () =>
              openDialog({
                  title: parseFilename(liveFile.filename).name,
                  props: { className: 'rounded-3xl sm:max-w-4xl' },
                  content: <GcodePreview printerId={printerId} file={liveFile} />,
              })
        : undefined;

    return (
        <section
            className={cn(
                'flex min-w-0 flex-col rounded-3xl',
                active ? 'gap-4 bg-primary p-5 text-primary-foreground' : 'gap-3 bg-card p-4 text-card-foreground',
                className,
            )}
        >
            {active ? (
                <>
                    <header className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-medium leading-tight">{m.print_title()}</h2>
                        <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium">
                            {paused ? m.print_paused() : calibrating ? m.state_calibrating() : m.print_in_progress()}
                        </span>
                    </header>
                    <div className="flex items-center gap-3">
                        <PreviewTile thumbnail={thumbnail} onOpen={openPreview} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium" title={state.filename || undefined}>
                                {title?.name ?? state.filename}
                            </p>
                            {title?.plate != null && (
                                <p className="text-sm text-primary-foreground/80">
                                    {m.files_plate({ n: title.plate })}
                                </p>
                            )}
                        </div>
                        {!calibrating && <span className="text-3xl font-semibold tabular-nums">{state.pct}%</span>}
                    </div>
                    {calibrating ? (
                        <p className="text-sm text-primary-foreground/80">
                            {m.print_calibrating_hint({ step: kobraStateLabel(state.kobraState) })}
                        </p>
                    ) : (
                        <div
                            role="progressbar"
                            aria-label={m.print_title()}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={state.pct}
                            className="h-2 overflow-hidden rounded-full bg-primary-foreground/20"
                        >
                            <div
                                className="h-full rounded-full bg-primary-foreground transition-[width] duration-500"
                                style={{ width: `${state.pct}%` }}
                            />
                        </div>
                    )}
                    <dl className="grid grid-cols-3 gap-2">
                        <PrintTimes printerId={printerId} />
                        {liveFile ? (
                            <LayerKv printerId={printerId} file={liveFile} currLayer={state.currLayer} />
                        ) : (
                            <Kv
                                k={m.print_layer()}
                                v={state.totalLayers ? `${state.currLayer}/${state.totalLayers}` : '—'}
                            />
                        )}
                    </dl>
                    <div className="flex gap-2">
                        {printing ? (
                            <ActionButton
                                wide
                                title={m.common_pause()}
                                onClick={() => pause.mutate()}
                                disabled={pause.isPending}
                            >
                                <Pause /> {m.common_pause()}
                            </ActionButton>
                        ) : (
                            <ActionButton
                                wide
                                title={m.common_resume()}
                                onClick={() => resume.mutate()}
                                disabled={resume.isPending}
                            >
                                <Play /> {m.common_resume()}
                            </ActionButton>
                        )}
                        <ActionButton
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
                        </ActionButton>
                        <ActionButton
                            danger
                            title={m.common_cancel()}
                            onClick={() => confirmCancel((reason) => cancel.mutateAsync(reason))}
                            disabled={cancel.isPending}
                        >
                            <Ban />
                        </ActionButton>
                    </div>
                </>
            ) : (
                <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                        <Box className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="font-medium leading-tight">
                            {state.connected ? m.print_none() : m.common_printer_offline()}
                        </h2>
                        {!state.fileReady && <p className="text-xs text-muted-foreground">{m.print_idle_hint()}</p>}
                    </div>
                </div>
            )}

            {state.fileReady && !active && (
                <div className="flex items-center justify-between gap-2 rounded-2xl bg-primary/15 px-4 py-3 text-sm">
                    <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left hover:underline"
                        onClick={() => void openPrintReadyDialog(qc, printerId, state.fileReady)}
                    >
                        <strong>{state.fileReady}</strong> {m.print_file_ready()}
                    </button>
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
                <div
                    role="alert"
                    className={cn(
                        'rounded-2xl px-4 py-3 text-sm',
                        active ? 'bg-primary-foreground/15' : 'bg-destructive/15 text-destructive',
                    )}
                >
                    [{state.errorCode}] {printerErrorText(state.errorCode, state.pauseMsg)}
                </div>
            )}
        </section>
    );
}

function PrintTimes({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId, (s) => ({
        printState: s.printState,
        kobraState: s.kobraState,
        currLayer: s.currLayer,
        printTimeAt: s.printTimeAt,
        printDurationSec: s.printDurationSec,
        remainTimeSec: s.remainTimeSec,
        slicerTimeSec: s.slicerTimeSec,
    }));
    const clock = usePrintClock(state);
    const remaining =
        clock.remainSec || (state.slicerTimeSec ? Math.max(0, state.slicerTimeSec - clock.elapsedSec) : 0);
    return (
        <>
            <Kv
                k={m.print_elapsed()}
                v={isCalibrating(state) ? '—' : formatDuration(clock.elapsedSec, { zero: true, units: 2 })}
            />
            <Kv k={m.print_remaining()} v={formatDuration(remaining, { zero: true, units: 2 })} />
        </>
    );
}

function LayerKv({ printerId, file, currLayer }: { printerId: string; file: GcodeFileDto; currLayer: number }) {
    const status = useParsedGcode(printerId, file);
    const total = status.kind === 'ready' ? status.data.layers.length : undefined;
    return <Kv k={m.print_layer()} v={total ? `${currLayer}/${total}` : '—'} />;
}

function PreviewTile({ thumbnail, onOpen }: { thumbnail: string; onOpen?: () => void }) {
    const body = thumbnail ? (
        <img src={`data:image/png;base64,${thumbnail}`} alt="" className="size-full object-contain p-1.5" />
    ) : (
        <Box className="size-6 text-primary-foreground/50" />
    );
    const frame =
        'relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-foreground/12';
    if (!onOpen) {
        return (
            <div className={frame} role="img" aria-label={m.print_preview()}>
                {body}
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={m.print_view_3d()}
            title={m.print_view_3d()}
            className={cn(
                frame,
                'outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-primary-foreground',
            )}
        >
            {body}
            <span className="absolute right-1 bottom-1 rounded-full bg-card px-1.5 text-[10px] font-semibold text-primary-strong">
                3D
            </span>
        </button>
    );
}

function Kv({ k, v }: { k: string; v: string }) {
    return (
        <div className="min-w-0 rounded-2xl bg-primary-foreground/10 px-3 py-2">
            <dt className="text-xs text-primary-foreground/75">{k}</dt>
            <dd className="truncate text-sm font-medium whitespace-nowrap tabular-nums">{v}</dd>
        </div>
    );
}

function ActionButton({
    className,
    title,
    wide,
    danger,
    ...props
}: React.ComponentProps<'button'> & { wide?: boolean; danger?: boolean }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            {...props}
            className={cn(
                'flex h-10 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors disabled:opacity-50 [&_svg]:size-4',
                wide
                    ? 'flex-1 bg-card px-4 text-primary-strong shadow-sm hover:bg-card/90'
                    : danger
                      ? 'w-10 bg-destructive text-white hover:bg-destructive/90'
                      : 'w-10 bg-primary-foreground/15 hover:bg-primary-foreground/25',
                className,
            )}
        />
    );
}
