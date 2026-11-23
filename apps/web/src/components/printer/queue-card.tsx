import type { ScheduledPrintDto } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ListOrdered, Play, Trash2, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, IconButton, Panel } from '@/components/printer/panel';
import { AutoStartCountdown } from '@/components/queue/auto-start-countdown';
import { BedClearBanner } from '@/components/queue/bed-clear-banner';
import { moveInOrder, QueueItemRow } from '@/components/queue/queue-item-row';
import { queueModeText } from '@/components/queue/queue-mode';
import { Button } from '@/components/ui/button';
import { useLiveState, usePrinter, usePrinters } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { formatDate, formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { allQueueQuery, queueQuery, queueStatusQuery, scheduleQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export function QueueCard({ printerId, className }: { printerId: string; className?: string }) {
    const state = useLiveState(printerId);
    const printer = usePrinter(printerId);
    const printers = usePrinters();
    const qc = useQueryClient();
    const queue = useQuery(queueQuery(printerId));
    const all = useQuery(allQueueQuery);
    const status = useQuery(queueStatusQuery(printerId));
    const schedule = useQuery(scheduleQuery(printerId));
    const items = queue.data ?? [];
    const scheduled = schedule.data ?? [];
    const idle = state.connected && state.printState !== 'printing' && state.printState !== 'paused';
    const maintenance = Boolean(status.data?.maintenance);
    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'queue'] });
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'queue-status'] });
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'files'] });
        void qc.invalidateQueries({ queryKey: ['queue'] });
    };
    const onError = (e: Error) => toast.error(e.message);
    const removeScheduled = useMutation({
        mutationFn: (id: string) => api.schedule.remove(printerId, id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['printers', printerId, 'schedule'] }),
        onError,
    });
    const start = useMutation({
        mutationFn: () => api.queue.start(printerId),
        onSuccess: (item) => {
            toast.success(m.files_print_started({ name: item.filename }));
            invalidate();
        },
        onError,
    });
    const remove = useMutation({ mutationFn: (id: string) => api.queue.remove(id), onSuccess: invalidate, onError });
    const clear = useMutation({ mutationFn: () => api.queue.clear(printerId), onSuccess: invalidate, onError });
    const reorder = useMutation({
        mutationFn: (ids: string[]) => api.queue.reorder(ids),
        onSuccess: invalidate,
        onError,
    });
    const toggleMaintenance = useMutation({
        mutationFn: () => api.queue.maintenance(printerId, !maintenance),
        onSuccess: (next) => {
            qc.setQueryData(queueStatusQuery(printerId).queryKey, next);
            invalidate();
            void qc.invalidateQueries({ queryKey: ['printers'] });
        },
        onError,
    });
    const move = (index: number, dir: -1 | 1) => {
        const neighbour = items[index + dir];
        if (!neighbour) return;
        const order = (all.data ?? items).map((i) => i.id);
        reorder.mutate(moveInOrder(order, items[index].id, neighbour.id));
    };
    const total = items.reduce((a, i) => a + i.estPrintTimeSec, 0);

    return (
        <Panel
            className={className}
            title={m.queue_title()}
            action={
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {items.length > 0 && (
                        <span>{m.queue_total({ n: items.length, duration: formatDuration(total, { units: 2 }) })}</span>
                    )}
                    <IconButton
                        title={m.queue_maintenance()}
                        aria-pressed={maintenance}
                        className={cn(maintenance && 'bg-primary text-primary-foreground')}
                        onClick={() => toggleMaintenance.mutate()}
                    >
                        <Wrench />
                    </IconButton>
                    {items.some((i) => i.printerId === printerId) && (
                        <IconButton
                            title={m.queue_clear()}
                            onClick={() =>
                                alertConfirmationDialogStore.actions.openAlertDialog({
                                    title: m.queue_clear_title(),
                                    description: m.queue_clear_hint(),
                                    actionLabel: m.queue_clear(),
                                    onAction: () => clear.mutateAsync(),
                                })
                            }
                        >
                            <Trash2 />
                        </IconButton>
                    )}
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                {maintenance && (
                    <div role="status" className="rounded-2xl bg-secondary px-4 py-3 text-sm">
                        <div className="font-medium">{m.queue_maintenance()}</div>
                        <div className="text-xs text-muted-foreground">{m.queue_maintenance_hint()}</div>
                    </div>
                )}
                {status.data?.awaitingBedClear && idle && <BedClearBanner printerId={printerId} />}
                {status.data?.autoStartAt && (
                    <AutoStartCountdown printerId={printerId} startsAt={status.data.autoStartAt} />
                )}
                {scheduled.length > 0 && (
                    <ul className="space-y-1">
                        {scheduled.map((s) => (
                            <ScheduledRow key={s.id} item={s} onRemove={() => removeScheduled.mutate(s.id)} />
                        ))}
                    </ul>
                )}
                {items.length === 0 ? (
                    <EmptyState icon={<ListOrdered />}>{m.queue_empty()}</EmptyState>
                ) : (
                    <>
                        <div className="max-h-80 overflow-y-auto">
                            <ul className="space-y-2">
                                {items.map((item, i) => (
                                    <QueueItemRow
                                        key={item.id}
                                        item={item}
                                        printers={printers}
                                        first={i === 0}
                                        last={i === items.length - 1}
                                        onUp={() => move(i, -1)}
                                        onDown={() => move(i, 1)}
                                        onRemove={() => remove.mutate(item.id)}
                                    />
                                ))}
                            </ul>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{printer ? queueModeText(printer.settings) : null}</span>
                            <Button
                                size="sm"
                                className="rounded-full"
                                disabled={!idle || maintenance || start.isPending}
                                onClick={() => start.mutate()}
                            >
                                <Play className="size-3.5" /> {m.queue_start_next()}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Panel>
    );
}

export function ScheduledRow({ item, onRemove }: { item: ScheduledPrintDto; onRemove: () => void }) {
    return (
        <li className="flex items-center gap-2 rounded-full bg-background/60 px-3 py-1.5 text-xs">
            <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate" title={item.filename}>
                {m.schedule_item({ date: formatDate(item.startAt), name: item.filename })}
            </span>
            <button
                type="button"
                onClick={onRemove}
                className="rounded-full p-0.5 hover:bg-background"
                aria-label={m.common_delete()}
            >
                <X className="size-3.5" />
            </button>
        </li>
    );
}
