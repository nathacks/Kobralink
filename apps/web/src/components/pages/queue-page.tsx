import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListOrdered, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/printer/panel';
import { ScheduledRow } from '@/components/printer/queue-card';
import { AutoStartCountdown } from '@/components/queue/auto-start-countdown';
import { BedClearBanner } from '@/components/queue/bed-clear-banner';
import { moveInOrder, QueueItemRow } from '@/components/queue/queue-item-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePrinters } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { allQueueQuery, queueStatusQuery, scheduleQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { PageHeader } from './page-header';

type Tab = 'queued' | 'removal' | 'scheduled';

export function QueuePage() {
    const qc = useQueryClient();
    const printers = usePrinters();
    const [tab, setTab] = useState<Tab>('queued');
    const queue = useQuery(allQueueQuery);
    const schedules = useQueries({ queries: printers.map((p) => scheduleQuery(p.id)) });
    const statuses = useQueries({ queries: printers.map((p) => queueStatusQuery(p.id)) });
    const countdowns = printers.flatMap((p, i) => {
        const at = statuses[i]?.data?.autoStartAt;
        return at ? [{ printer: p, at }] : [];
    });
    const items = queue.data ?? [];
    const removal = printers.filter(
        (p) =>
            p.awaitingBedClear &&
            p.live?.connected &&
            p.live.printState !== 'printing' &&
            p.live.printState !== 'paused',
    );
    const scheduled = printers.flatMap((p, i) => (schedules[i]?.data ?? []).map((s) => ({ printer: p, item: s })));
    const invalidate = () => void qc.invalidateQueries({ queryKey: ['queue'] });
    const onError = (e: Error) => toast.error(e.message);
    const reorder = useMutation({
        mutationFn: (ids: string[]) => api.queue.reorder(ids),
        onSuccess: invalidate,
        onError,
    });
    const remove = useMutation({ mutationFn: (id: string) => api.queue.remove(id), onSuccess: invalidate, onError });
    const clear = useMutation({ mutationFn: () => api.queue.clear(), onSuccess: invalidate, onError });
    const removeScheduled = useMutation({
        mutationFn: ({ printerId, id }: { printerId: string; id: string }) => api.schedule.remove(printerId, id),
        onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ['printers', v.printerId, 'schedule'] }),
        onError,
    });
    const tabs: { value: Tab; label: string; count: number }[] = [
        { value: 'queued', label: m.queue_tab_queued(), count: items.length },
        { value: 'removal', label: m.queue_tab_removal(), count: removal.length },
        { value: 'scheduled', label: m.queue_tab_scheduled(), count: scheduled.length },
    ];
    const total = items.reduce((a, i) => a + i.estPrintTimeSec, 0);

    return (
        <div className="grid gap-4">
            <PageHeader title={m.nav_queue()} hint={m.queue_page_hint()}>
                {items.length > 0 && tab === 'queued' && (
                    <Button
                        variant="secondary"
                        className="rounded-full"
                        onClick={() =>
                            alertConfirmationDialogStore.actions.openAlertDialog({
                                title: m.queue_clear_title(),
                                description: m.queue_clear_hint(),
                                actionLabel: m.queue_clear(),
                                onAction: () => clear.mutateAsync(),
                            })
                        }
                    >
                        <Trash2 /> {m.queue_clear()}
                    </Button>
                )}
            </PageHeader>
            {countdowns.map(({ printer, at }) => (
                <AutoStartCountdown key={printer.id} printerId={printer.id} startsAt={at} name={printer.name} />
            ))}
            <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-secondary p-1 [scrollbar-width:none]">
                {tabs.map((t) => (
                    <button
                        key={t.value}
                        type="button"
                        aria-pressed={tab === t.value}
                        onClick={() => setTab(t.value)}
                        className={cn(
                            'shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                            tab === t.value
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
                    </button>
                ))}
            </div>
            <Card className="rounded-3xl border-0 shadow-none">
                <CardContent className="grid gap-3">
                    {tab === 'queued' &&
                        (items.length === 0 ? (
                            <EmptyState icon={<ListOrdered />}>{m.queue_empty()}</EmptyState>
                        ) : (
                            <>
                                <p className="text-xs text-muted-foreground">
                                    {m.queue_total({ n: items.length, duration: formatDuration(total, { units: 2 }) })}
                                </p>
                                <ul className="grid gap-2">
                                    {items.map((item, i) => (
                                        <QueueItemRow
                                            key={item.id}
                                            item={item}
                                            printers={printers}
                                            first={i === 0}
                                            last={i === items.length - 1}
                                            onUp={() =>
                                                reorder.mutate(
                                                    moveInOrder(
                                                        items.map((x) => x.id),
                                                        item.id,
                                                        items[i - 1].id,
                                                    ),
                                                )
                                            }
                                            onDown={() =>
                                                reorder.mutate(
                                                    moveInOrder(
                                                        items.map((x) => x.id),
                                                        item.id,
                                                        items[i + 1].id,
                                                    ),
                                                )
                                            }
                                            onRemove={() => remove.mutate(item.id)}
                                        />
                                    ))}
                                </ul>
                            </>
                        ))}
                    {tab === 'removal' &&
                        (removal.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">{m.queue_removal_empty()}</p>
                        ) : (
                            removal.map((p) => <BedClearBanner key={p.id} printerId={p.id} name={p.name} />)
                        ))}
                    {tab === 'scheduled' &&
                        (scheduled.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                {m.queue_scheduled_empty()}
                            </p>
                        ) : (
                            <ul className="grid gap-1">
                                {scheduled.map(({ printer, item }) => (
                                    <ScheduledRow
                                        key={item.id}
                                        item={{ ...item, filename: `${printer.name} · ${item.filename}` }}
                                        onRemove={() => removeScheduled.mutate({ printerId: printer.id, id: item.id })}
                                    />
                                ))}
                            </ul>
                        ))}
                </CardContent>
            </Card>
        </div>
    );
}
