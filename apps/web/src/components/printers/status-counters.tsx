import { Clock } from 'lucide-react';
import type { PrinterWithLive } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { countByStatus, HOME_STATUS_LABEL, HOME_STATUSES, type HomeStatus, nextToFinish } from './printer-status';

const DOT: Record<HomeStatus, string> = {
    printing: 'bg-primary',
    paused: 'bg-chart-2',
    bed_clear: 'bg-chart-2',
    ready: 'bg-chart-3',
    error: 'bg-destructive',
    maintenance: 'bg-chart-4',
    offline: 'bg-muted-foreground/50',
};

export function StatusCounters({
    printers,
    active,
    onSelect,
}: {
    printers: PrinterWithLive[];
    active: HomeStatus | undefined;
    onSelect: (status: HomeStatus | undefined) => void;
}) {
    const counts = countByStatus(printers);
    const next = nextToFinish(printers);
    const chip = 'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors';
    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                aria-pressed={!active}
                onClick={() => onSelect(undefined)}
                className={cn(
                    chip,
                    !active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground hover:text-foreground',
                )}
            >
                {m.home_filter_all()}
                <span className="tabular-nums">{printers.length}</span>
            </button>
            {HOME_STATUSES.filter((s) => counts[s] > 0 || s === active).map((s) => (
                <button
                    key={s}
                    type="button"
                    aria-pressed={active === s}
                    onClick={() => onSelect(active === s ? undefined : s)}
                    className={cn(
                        chip,
                        active === s
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card text-muted-foreground hover:text-foreground',
                    )}
                >
                    <span className={cn('size-2 rounded-full', DOT[s])} />
                    {HOME_STATUS_LABEL[s]()}
                    <span className="tabular-nums">{counts[s]}</span>
                </button>
            ))}
            {next && (
                <span className="flex items-center gap-1.5 px-2 text-sm text-muted-foreground">
                    <Clock className="size-4" />
                    {m.home_next_finish({ name: next.name, time: formatClock(next.at) })}
                </span>
            )}
        </div>
    );
}
