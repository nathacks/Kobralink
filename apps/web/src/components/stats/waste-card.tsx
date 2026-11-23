import type { StatsWaste, StatsWasteEntry } from '@kobralink/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function formatWeight(g: number): string {
    return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
}

function WasteRow({
    label,
    hint,
    entry,
    total,
    currency,
    barClass,
}: {
    label: string;
    hint: string;
    entry: StatsWasteEntry;
    total: number;
    currency: string;
    barClass: string;
}) {
    const pct = total > 0 ? Math.round((entry.weightG / total) * 100) : 0;
    return (
        <li className="rounded-2xl bg-secondary/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium">{label}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                    {m.stats_waste_entry({ n: entry.jobs, weight: formatWeight(entry.weightG) })}
                    {entry.filamentCost > 0 ? ` · ${formatMoney(entry.filamentCost, currency)}` : ''}
                </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/60">
                <div role="presentation" className={cn('h-full rounded-full', barClass)} style={{ width: `${pct}%` }} />
            </div>
        </li>
    );
}

export function WasteCard({
    waste,
    totalFilamentG,
    currency,
}: {
    waste: StatsWaste;
    totalFilamentG: number;
    currency: string;
}) {
    const weightG = waste.paused.weightG + waste.cancelled.weightG;
    const cost = waste.paused.filamentCost + waste.cancelled.filamentCost;
    const jobs = waste.paused.jobs + waste.cancelled.jobs;
    const share = totalFilamentG > 0 ? Math.round((weightG / totalFilamentG) * 100) : 0;
    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader>
                <CardTitle className="text-lg font-medium">{m.stats_waste_title()}</CardTitle>
                <CardDescription>{m.stats_waste_hint()}</CardDescription>
            </CardHeader>
            <CardContent>
                {jobs === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">{m.stats_waste_none()}</p>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:items-center">
                        <div>
                            <div className="text-4xl font-semibold tracking-tight tabular-nums">
                                {formatWeight(weightG)}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                                {m.stats_waste_share({ pct: share })}
                                {cost > 0 ? ` · ${formatMoney(cost, currency)}` : ''}
                            </div>
                        </div>
                        <ul className="grid gap-3 md:grid-cols-2">
                            <WasteRow
                                label={m.stats_waste_paused()}
                                hint={m.stats_waste_paused_hint()}
                                entry={waste.paused}
                                total={weightG}
                                currency={currency}
                                barClass="bg-chart-2"
                            />
                            <WasteRow
                                label={m.stats_waste_cancelled()}
                                hint={m.stats_waste_cancelled_hint()}
                                entry={waste.cancelled}
                                total={weightG}
                                currency={currency}
                                barClass="bg-chart-5"
                            />
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
