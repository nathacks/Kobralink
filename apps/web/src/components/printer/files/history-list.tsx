import type { PrintJobDto } from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { Box, Camera, Clock, Tag } from 'lucide-react';
import { parseFilename } from '@/lib/filename';
import { formatDate, formatDuration, formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { failureReasonLabel, jobStatusLabel } from '@/lib/labels';
import { appSettingsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { FailureDialog } from './failure-dialog';

function statusDot(status: PrintJobDto['status']): string {
    if (status === 'completed') return 'bg-primary';
    if (status === 'printing') return 'bg-chart-3';
    return 'bg-destructive';
}

function CostRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-2', strong && 'font-medium text-foreground')}>
            <dt className="min-w-0 truncate">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}

function HistoryCard({
    job,
    currency,
    printerName,
    onFailure,
}: {
    job: PrintJobDto;
    currency: string;
    printerName?: string;
    onFailure: () => void;
}) {
    const { name, plate } = parseFilename(job.filename);
    const failed = job.status === 'cancelled' || job.status === 'error';
    const energyLabel =
        job.energyKwh === null
            ? m.history_cost_energy()
            : `${m.history_cost_energy()} · ${m.energy_kwh({ kwh: job.energyKwh.toFixed(2) })}`;
    return (
        <article className="flex flex-col overflow-hidden rounded-3xl bg-secondary text-secondary-foreground">
            <div className="relative flex aspect-[4/3] items-center justify-center bg-background/40">
                {job.thumbnail ? (
                    <img
                        src={`data:image/png;base64,${job.thumbnail}`}
                        alt=""
                        className={cn('size-full object-contain p-3', failed && 'opacity-60 grayscale')}
                    />
                ) : (
                    <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                        <Box className="size-8 opacity-60" />
                        {m.files_no_preview()}
                    </span>
                )}
                <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
                    <span className={cn('size-2 rounded-full', statusDot(job.status))} />
                    {jobStatusLabel(job.status)}
                </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-medium leading-snug" title={job.filename}>
                        {name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {[printerName, plate !== null ? m.files_plate({ n: plate }) : null, formatDate(job.startedAt)]
                            .filter(Boolean)
                            .join(' · ')}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    <span className="tabular-nums">{formatDuration(job.durationSec ?? 0)}</span>
                </div>
                {failed && (
                    <button
                        type="button"
                        onClick={onFailure}
                        className="inline-flex max-w-full items-center gap-1 self-start rounded-full bg-background/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <Tag className="size-3 shrink-0" />
                        <span className="shrink-0">{failureReasonLabel(job.failureReason)}</span>
                        {job.hasSnapshot && <Camera className="size-3 shrink-0" />}
                        {job.note ? <span className="truncate">· {job.note}</span> : null}
                    </button>
                )}
                {job.cost && (
                    <dl className="mt-auto grid gap-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        <CostRow label={m.history_cost_filament()} value={formatMoney(job.cost.filament, currency)} />
                        <CostRow label={energyLabel} value={formatMoney(job.cost.energy, currency)} />
                        <CostRow label={m.history_cost_total()} value={formatMoney(job.cost.total, currency)} strong />
                    </dl>
                )}
            </div>
        </article>
    );
}

export function HistoryList({
    printerId,
    jobs,
    printerNames,
}: {
    printerId: string;
    jobs: PrintJobDto[];
    printerNames?: Record<string, string>;
}) {
    const settings = useQuery(appSettingsQuery);
    const currency = settings.data?.currency ?? 'EUR';
    if (!jobs.length) return <p className="text-sm text-muted-foreground">{m.history_empty()}</p>;
    const openFailure = (job: PrintJobDto) =>
        confirmationDialogStore.actions.openDialog({
            title: m.history_edit_failure(),
            description: parseFilename(job.filename).name,
            content: <FailureDialog printerId={job.printerId || printerId} job={job} />,
        });
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3">
            {jobs.map((j) => (
                <HistoryCard
                    key={j.id}
                    job={j}
                    currency={currency}
                    printerName={printerNames?.[j.printerId]}
                    onFailure={() => openFailure(j)}
                />
            ))}
        </div>
    );
}
