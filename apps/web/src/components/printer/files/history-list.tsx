import type { PrintJobDto } from '@kobralink/shared';
import { formatDate, formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { jobStatusLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function HistoryList({ jobs }: { jobs: PrintJobDto[] }) {
    if (!jobs.length) return <p className="text-sm text-muted-foreground">{m.history_empty()}</p>;
    return (
        <ul className="divide-y divide-border">
            {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-4 py-3 text-sm">
                    <span
                        className={cn(
                            'size-2.5 shrink-0 rounded-full',
                            j.status === 'completed'
                                ? 'bg-primary'
                                : j.status === 'printing'
                                  ? 'bg-chart-3'
                                  : 'bg-muted-foreground/50',
                        )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium" title={j.filename}>
                        {j.filename}
                    </span>
                    <span className="text-muted-foreground">{formatDate(j.startedAt)}</span>
                    <span className="w-20 text-right tabular-nums text-muted-foreground">
                        {formatDuration(j.durationSec ?? 0)}
                    </span>
                    <span className="w-16 text-right text-muted-foreground">{jobStatusLabel(j.status)}</span>
                </li>
            ))}
        </ul>
    );
}
