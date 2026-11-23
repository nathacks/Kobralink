import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { SettingsCard } from '@/components/settings/settings-form-card';
import { Button } from '@/components/ui/button';
import { remainingFraction } from '@/hooks/use-slot-spool';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { spoolmanSpoolsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function SpoolmanSpoolsCard({ serverUrl }: { serverUrl: string }) {
    const spools = useQuery(spoolmanSpoolsQuery(true));
    const health = useQuery({ queryKey: ['spoolman', 'health'], queryFn: api.spoolman.health, retry: false });
    const pending = health.data?.pending ?? 0;
    return (
        <SettingsCard title={m.spoolman_spools_title()} description={m.spoolman_spools_hint()}>
            <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="secondary" size="sm" className="rounded-full">
                    <a href={serverUrl} target="_blank" rel="noreferrer">
                        <ExternalLink /> {m.spoolman_open()}
                    </a>
                </Button>
                {pending > 0 && (
                    <span className="text-sm text-muted-foreground">{m.spoolman_pending({ n: pending })}</span>
                )}
            </div>
            {spools.isError && <p className="text-sm text-destructive">{m.spoolman_unreachable()}</p>}
            {spools.data && spools.data.length === 0 && (
                <p className="text-sm text-muted-foreground">{m.spools_empty()}</p>
            )}
            {spools.data && spools.data.length > 0 && (
                <ul className="grid gap-2 md:grid-cols-2">
                    {spools.data.map((s) => {
                        const hex = s.filament.color_hex ? `#${s.filament.color_hex.replace(/^#/, '')}` : undefined;
                        const fraction = remainingFraction(
                            s.remaining_weight,
                            (s.remaining_weight ?? 0) + (s.used_weight ?? 0),
                        );
                        const name = [s.filament.vendor?.name, s.filament.name].filter(Boolean).join(' ');
                        return (
                            <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
                                <span
                                    className="size-8 shrink-0 rounded-full ring-1 ring-border"
                                    style={{ background: hex ?? 'var(--muted)' }}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                        #{s.id} · {name || s.filament.material}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {[
                                            s.filament.material,
                                            s.remaining_weight !== undefined
                                                ? m.spoolman_spool_left({ remaining: Math.round(s.remaining_weight) })
                                                : null,
                                            s.location || null,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </div>
                                    {fraction !== undefined && (
                                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
                                            <div
                                                role="presentation"
                                                className={cn(
                                                    'h-full rounded-full',
                                                    fraction < 0.15 ? 'bg-destructive' : 'bg-primary',
                                                )}
                                                style={{ width: `${fraction * 100}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </SettingsCard>
    );
}
