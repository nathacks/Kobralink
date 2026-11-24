import type { CompatReason, Printer, QueueItemDto, QueueWaitReason } from '@kobralink/shared';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const WAIT_LABEL: Record<QueueWaitReason, () => string> = {
    no_printer: m.queue_waiting_no_printer,
    busy: m.queue_waiting_busy,
    bed_clear: m.queue_waiting_bed_clear,
    maintenance: m.queue_waiting_maintenance,
    offline: m.queue_waiting_offline,
    filament: m.queue_waiting_filament,
    manual: m.queue_waiting_manual,
};

export const COMPAT_LABEL: Record<CompatReason, () => string> = {
    target: m.compat_target,
    model: m.compat_model,
    nozzle: m.compat_nozzle,
    size: m.compat_size,
    material: m.compat_material,
    color: m.compat_color,
};

const WAIT_CLASS: Record<QueueWaitReason, string> = {
    no_printer: 'bg-destructive/15 text-destructive',
    filament: 'bg-destructive/15 text-destructive',
    offline: 'bg-secondary text-muted-foreground',
    maintenance: 'bg-secondary text-muted-foreground',
    busy: 'bg-secondary text-muted-foreground',
    bed_clear: 'bg-chart-2/20 text-foreground',
    manual: 'bg-primary/15 text-primary-strong',
};

export function targetLabel(item: Pick<QueueItemDto, 'printerId' | 'targetTags'>, printers: Printer[]): string {
    if (item.printerId) return printers.find((p) => p.id === item.printerId)?.name ?? item.printerId;
    if (item.targetTags.length) return m.queue_target_tags({ tags: item.targetTags.join(', ') });
    return m.queue_target_any();
}

export function QueueItemRow({
    item,
    printers,
    first,
    last,
    onUp,
    onDown,
    onRemove,
}: {
    item: QueueItemDto;
    printers: Printer[];
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDuration(item.estPrintTimeSec, { units: 2 })}</span>
                    <span>· {targetLabel(item, printers)}</span>
                    {item.excludedObjects.length ? (
                        <span>· {m.queue_excluded({ n: item.excludedObjects.length })}</span>
                    ) : null}
                    {item.waiting && (
                        <span className={cn('rounded-full px-2 py-0.5 font-medium', WAIT_CLASS[item.waiting])}>
                            {WAIT_LABEL[item.waiting]()}
                        </span>
                    )}
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

export function moveInOrder(all: string[], id: string, neighbour: string): string[] {
    const ids = [...all];
    const a = ids.indexOf(id);
    const b = ids.indexOf(neighbour);
    if (a < 0 || b < 0) return ids;
    [ids[a], ids[b]] = [ids[b], ids[a]];
    return ids;
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
