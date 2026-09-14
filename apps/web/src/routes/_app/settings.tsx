import { type AppSettings, optionalUrl } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { FilamentProfilesCard } from '@/components/printer/filament-profiles-card';
import { DryPresetsCard } from '@/components/settings/dry-presets-card';
import { GeneralCard } from '@/components/settings/general-card';
import { HaMqttCard } from '@/components/settings/ha-mqtt-card';
import { MacrosEditor } from '@/components/settings/macros-editor';
import { NotificationsCard } from '@/components/settings/notifications-card';
import { SpoolsCard } from '@/components/settings/spools-card';
import { SystemCard } from '@/components/settings/system-card';
import { UsersCard } from '@/components/settings/users-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCanOperate, useIsAdmin } from '@/hooks/use-role';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const TABS = ['general', 'notifications', 'integrations', 'filament', 'macros', 'users', 'system'] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute('/_app/settings')({
    validateSearch: z.object({ tab: z.enum(TABS).optional() }),
    loader: ({ context }) => context.queryClient.ensureQueryData(appSettingsQuery),
    component: SettingsPage,
});

const TAB_LABEL: Record<Tab, () => string> = {
    general: m.settings_tab_general,
    notifications: m.settings_tab_notifications,
    integrations: m.settings_tab_integrations,
    filament: m.settings_tab_filament,
    macros: m.settings_tab_macros,
    users: m.settings_tab_users,
    system: m.settings_tab_system,
};

function SettingsPage() {
    const { tab = 'general' } = Route.useSearch();
    const navigate = Route.useNavigate();
    const settings = useQuery(appSettingsQuery);
    const isAdmin = useIsAdmin();
    const canOperate = useCanOperate();
    if (!settings.data) return null;
    const s = settings.data;
    const tabs = TABS.filter((t) => t !== 'users' || isAdmin);
    return (
        <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3 px-2">
                <h2 className="text-xl font-medium">{m.bridge_settings_title()}</h2>
            </div>
            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-secondary p-1">
                {tabs.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => navigate({ search: { tab: t }, replace: true })}
                        className={cn(
                            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                            tab === t
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {TAB_LABEL[t]()}
                    </button>
                ))}
            </div>
            {!canOperate && (
                <div className="rounded-3xl bg-secondary px-5 py-3 text-sm text-muted-foreground">
                    {m.role_viewer_hint()}
                </div>
            )}
            <fieldset disabled={!canOperate} className="contents">
                <div key={`${tab}-${JSON.stringify(s)}`} className="space-y-4">
                    {tab === 'general' && <GeneralCard settings={s} />}
                    {tab === 'notifications' && <NotificationsCard settings={s} />}
                    {tab === 'integrations' && (
                        <>
                            <SpoolmanCard settings={s} />
                            <HaMqttCard settings={s} />
                        </>
                    )}
                    {tab === 'filament' && (
                        <>
                            <SpoolsCard />
                            <DryPresetsCard settings={s} />
                            <FilamentProfilesCard />
                        </>
                    )}
                    {tab === 'macros' && <MacrosEditor />}
                    {tab === 'users' && isAdmin && <UsersCard />}
                    {tab === 'system' && <SystemCard />}
                </div>
            </fieldset>
        </div>
    );
}

const spoolmanSchema = z.object({
    spoolmanUrl: optionalUrl,
    spoolmanSyncRateSec: z.number().int().min(0).max(3600),
});

function SpoolmanCard({ settings }: { settings: AppSettings }) {
    const qc = useQueryClient();
    const health = useQuery({
        queryKey: ['spoolman', 'health'],
        queryFn: api.spoolman.health,
        enabled: Boolean(settings.spoolmanUrl),
        refetchInterval: 30_000,
        retry: false,
    });
    const save = useMutation({
        mutationFn: (v: z.infer<typeof spoolmanSchema>) => api.settings.update(v),
        onSuccess: (next) => {
            qc.setQueryData(appSettingsQuery.queryKey, next);
            void qc.invalidateQueries({ queryKey: ['spoolman'] });
            void qc.invalidateQueries({ queryKey: ['printers'] });
            toast.success(m.settings_saved());
        },
        onError: (e) => toast.error(e.message),
    });
    const form = useForm({
        defaultValues: { spoolmanUrl: settings.spoolmanUrl, spoolmanSyncRateSec: settings.spoolmanSyncRateSec },
        validators: { onSubmit: spoolmanSchema },
        onSubmit: ({ value }) => save.mutateAsync(value).catch(() => undefined),
    });
    const dot = !settings.spoolmanUrl
        ? 'bg-muted-foreground/40'
        : health.data?.reachable
          ? 'bg-primary'
          : 'bg-destructive';

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <Card className="rounded-3xl border-0 shadow-none">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Spoolman <span className={cn('size-2 rounded-full', dot)} />
                    </CardTitle>
                    <CardDescription>
                        {m.spoolman_hint()}
                        {settings.spoolmanUrl &&
                            (health.data?.reachable
                                ? ` ${m.spoolman_reachable()}`
                                : health.isFetched
                                  ? ` ${m.spoolman_unreachable()}`
                                  : '')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <form.Field name="spoolmanUrl">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>{m.spoolman_server_url()}</Label>
                                <Input
                                    id={field.name}
                                    type="url"
                                    placeholder="http://192.168.1.20:7912"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="rounded-full px-4"
                                />
                                <FieldError meta={field.state.meta} />
                            </div>
                        )}
                    </form.Field>
                    <form.Field name="spoolmanSyncRateSec">
                        {(field) => (
                            <div className="grid gap-2">
                                <Label htmlFor={field.name}>{m.spoolman_sync_rate()}</Label>
                                <Input
                                    id={field.name}
                                    type="number"
                                    min={0}
                                    max={3600}
                                    step={30}
                                    value={Number.isNaN(field.state.value) ? '' : field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                    aria-invalid={fieldInvalid(field.state.meta)}
                                    className="w-40 rounded-full px-4"
                                />
                                <p className="px-4 text-xs text-muted-foreground">{m.spoolman_sync_rate_hint()}</p>
                                <FieldError meta={field.state.meta} />
                            </div>
                        )}
                    </form.Field>
                    <div>
                        <form.Subscribe selector={(s) => s.isSubmitting}>
                            {(isSubmitting) => (
                                <Button type="submit" className="rounded-full px-6" disabled={isSubmitting}>
                                    {m.common_save()}
                                </Button>
                            )}
                        </form.Subscribe>
                    </div>
                </CardContent>
            </Card>
        </form>
    );
}
