import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { z } from 'zod';
import { StatsBody } from '@/components/stats/stats-body';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePrinters } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { statsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const searchSchema = z.object({
    printer: z.string().optional(),
    days: z.number().int().min(0).optional(),
});

export const Route = createFileRoute('/_app/stats')({
    validateSearch: searchSchema,
    component: StatsPage,
});

const RANGES = [7, 30, 90, 365, 0];

function StatsPage() {
    const { printer, days = 30 } = Route.useSearch();
    const navigate = Route.useNavigate();
    const printers = usePrinters();
    const stats = useQuery(statsQuery(printer, days));
    const set = (patch: { printer?: string; days?: number }) =>
        navigate({ search: (s) => ({ ...s, ...patch }), replace: true });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 px-2">
                <h2 className="text-xl font-medium">{m.stats_title()}</h2>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Select
                        value={printer ?? 'all'}
                        onValueChange={(v) => set({ printer: v === 'all' ? undefined : v })}
                    >
                        <SelectTrigger className="w-48 rounded-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{m.stats_all_printers()}</SelectItem>
                            {printers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="flex gap-1 rounded-full bg-secondary p-1">
                        {RANGES.map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => set({ days: r })}
                                className={cn(
                                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                    days === r
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {r === 0 ? m.stats_range_all() : m.stats_range_days({ n: r })}
                            </button>
                        ))}
                    </div>
                    <a
                        href={api.statsCsvUrl(printer, days)}
                        download
                        className="flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        <Download className="size-3.5" /> {m.stats_export_csv()}
                    </a>
                </div>
            </div>
            {stats.data ? <StatsBody data={stats.data} days={days} /> : <Skeleton className="h-96 rounded-3xl" />}
        </div>
    );
}
