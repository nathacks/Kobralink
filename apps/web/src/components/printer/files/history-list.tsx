import type { PrintJobDto } from '@kobralink/shared';
import { formatDate, formatDuration } from '@/lib/format';
import { JOB_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function HistoryList({ jobs }: { jobs: PrintJobDto[] }) {
    if (!jobs.length) return <p className="mt-5 text-sm text-muted-foreground">Aucune impression enregistrée.</p>;
    return (
        <ul className="mt-5 divide-y divide-border">
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
                    <span className="w-16 text-right text-muted-foreground">
                        {JOB_STATUS_LABEL[j.status] ?? j.status}
                    </span>
                </li>
            ))}
        </ul>
    );
}
