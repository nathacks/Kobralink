import type { QueueItemDto } from '@kobralink/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListOrdered, Play, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { queueQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export function QueueCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const printer = usePrinter(printerId);
    const qc = useQueryClient();
    const queue = useQuery(queueQuery(printerId));
    const items = queue.data ?? [];
    const idle = state.connected && state.printState !== 'printing' && state.printState !== 'paused';
    const invalidate = () => {
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'queue'] });
        void qc.invalidateQueries({ queryKey: ['printers', printerId, 'files'] });
    };
    const onError = (e: Error) => toast.error(e.message);
    const start = useMutation({
        mutationFn: () => api.queue.start(printerId),
        onSuccess: (item) => {
            toast.success(m.files_print_started({ name: item.filename }));
            invalidate();
        },
        onError,
    });
    const remove = useMutation({
        mutationFn: (id: string) => api.queue.remove(printerId, id),
        onSuccess: invalidate,
        onError,
    });
    const clear = useMutation({ mutationFn: () => api.queue.clear(printerId), onSuccess: invalidate, onError });
    const reorder = useMutation({
        mutationFn: (ids: string[]) => api.queue.reorder(printerId, ids),
        onSuccess: (next) => qc.setQueryData(queueQuery(printerId).queryKey, next),
        onError,
    });
    const move = (index: number, dir: -1 | 1) => {
        const ids = items.map((i) => i.id);
        const target = index + dir;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        reorder.mutate(ids);
    };
    const total = items.reduce((a, i) => a + i.estPrintTimeSec, 0);

    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">{m.queue_title()}</CardTitle>
                <CardAction className="flex items-center gap-2 text-xs text-muted-foreground">
                    {items.length > 0 && (
                        <span>{m.queue_total({ n: items.length, duration: formatDuration(total) })}</span>
                    )}
                    {items.length > 0 && (
                        <button
                            type="button"
                            title={m.queue_clear()}
                            aria-label={m.queue_clear()}
                            className="flex size-8 items-center justify-center rounded-full bg-secondary hover:bg-accent [&_svg]:size-3.5"
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
                        </button>
                    )}
                </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                {items.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
                        <ListOrdered className="size-6" />
                        {m.queue_empty()}
                    </div>
                ) : (
                    <>
                        <ScrollArea className="min-h-0 flex-1">
                            <ul className="space-y-2">
                                {items.map((item, i) => (
                                    <QueueRow
                                        key={item.id}
                                        item={item}
                                        first={i === 0}
                                        last={i === items.length - 1}
                                        onUp={() => move(i, -1)}
                                        onDown={() => move(i, 1)}
                                        onRemove={() => remove.mutate(item.id)}
                                    />
                                ))}
                            </ul>
                        </ScrollArea>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{printer?.settings.queueAutoStart ? m.queue_auto_on() : m.queue_auto_off()}</span>
                            <Button
                                size="sm"
                                className="rounded-full"
                                disabled={!idle || start.isPending}
                                onClick={() => start.mutate()}
                            >
                                <Play className="size-3.5" /> {m.queue_start_next()}
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function QueueRow({
    item,
    first,
    last,
    onUp,
    onDown,
    onRemove,
}: {
    item: QueueItemDto;
    first: boolean;
    last: boolean;
    onUp: () => void;
    onDown: () => void;
    onRemove: () => void;
}) {
    return (
        <li className={cn('flex items-center gap-3 rounded-2xl p-2 pr-3', first ? 'bg-primary/15' : 'bg-secondary/60')}>
            <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background/50">
                {item.thumbnail ? (
                    <img src={`data:image/png;base64,${item.thumbnail}`} alt="" className="size-full object-contain" />
                ) : (
                    <span className="text-[10px] text-muted-foreground">GCode</span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={item.filename}>
                    {item.filename}
                </div>
                <div className="text-xs text-muted-foreground">
                    {formatDuration(item.estPrintTimeSec)}
                    {item.excludedObjects.length ? ` · ${m.queue_excluded({ n: item.excludedObjects.length })}` : ''}
                </div>
            </div>
            <div className="flex gap-1">
                <Small onClick={onUp} disabled={first} title={m.queue_move_up()}>
                    <ArrowUp />
                </Small>
                <Small onClick={onDown} disabled={last} title={m.queue_move_down()}>
                    <ArrowDown />
                </Small>
                <Small onClick={onRemove} title={m.common_delete()}>
                    <X />
                </Small>
            </div>
        </li>
    );
}

function Small({ title, ...props }: React.ComponentProps<'button'> & { title: string }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            {...props}
            className="flex size-7 items-center justify-center rounded-full bg-background/50 hover:bg-background disabled:opacity-30 [&_svg]:size-3.5"
        />
    );
}
