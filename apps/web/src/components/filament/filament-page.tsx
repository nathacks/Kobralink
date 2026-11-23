import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { FilamentProfilesCard } from '@/components/printer/filament-profiles-card';
import { DryPresetsCard } from '@/components/settings/dry-presets-card';
import { OperatorOnly, settingsKey } from '@/components/settings/settings-form-card';
import { SpoolsCard } from '@/components/settings/spools-card';
import { Button } from '@/components/ui/button';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';
import { SpoolmanSpoolsCard } from './spoolman-spools-card';

export function FilamentPage() {
    const { data: s } = useSuspenseQuery(appSettingsQuery);
    return (
        <div className="grid gap-4">
            <div className="px-2">
                <h2 className="text-xl font-medium">{m.nav_filament()}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{m.filament_page_hint()}</p>
            </div>
            {!s.spoolmanUrl && (
                <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-primary/10 px-5 py-4 text-sm">
                    <Info className="size-5 shrink-0 text-primary-strong" />
                    <p className="min-w-56 flex-1">{m.filament_spoolman_recommended()}</p>
                    <Button asChild size="sm" className="rounded-full">
                        <Link to="/settings/integrations">{m.filament_spoolman_action()}</Link>
                    </Button>
                </div>
            )}
            <OperatorOnly>
                {s.spoolmanUrl ? <SpoolmanSpoolsCard serverUrl={s.spoolmanUrl} /> : <SpoolsCard />}
                <DryPresetsCard key={settingsKey(s, ['aceDryPresets'])} settings={s} />
                <FilamentProfilesCard />
            </OperatorOnly>
        </div>
    );
}
