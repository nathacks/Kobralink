import type { CostEstimate } from '@farolprint/shared';
import { Coins } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-3', strong && 'font-medium text-foreground')}>
            <dt className="min-w-0 truncate">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}

export function CostEstimateCard({
    estimate,
    currency,
    className,
}: {
    estimate: CostEstimate | null;
    currency: string;
    className?: string;
}) {
    if (!estimate) return null;
    const money = (v: number) => formatMoney(v, currency);
    return (
        <section
            aria-label={m.cost_estimate()}
            className={cn('rounded-2xl bg-secondary/60 p-3 text-sm text-muted-foreground', className)}
        >
            <h4 className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
                <Coins className="size-4 text-primary-strong" />
                {m.cost_estimate()}
            </h4>
            <dl className="grid gap-1">
                <Row
                    label={`${m.history_cost_filament()} · ${Math.round(estimate.weightG)} g`}
                    value={money(estimate.filament)}
                />
                <Row label={m.history_cost_energy()} value={money(estimate.energy)} />
                <Row label={m.history_cost_total()} value={`≈ ${money(estimate.total)}`} strong />
            </dl>
            {estimate.unpricedG > 0 && (
                <p className="mt-2 text-xs">{m.cost_estimate_unpriced({ g: Math.round(estimate.unpricedG) })}</p>
            )}
        </section>
    );
}
