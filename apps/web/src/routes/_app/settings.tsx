import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { visibleSections } from '@/components/settings/settings-sections';
import { useIsAdmin } from '@/hooks/use-role';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';

export const Route = createFileRoute('/_app/settings')({
    loader: ({ context }) => context.queryClient.ensureQueryData(appSettingsQuery),
    component: SettingsLayout,
});

function SettingsLayout() {
    const sections = visibleSections(useIsAdmin());
    return (
        <div className="space-y-4">
            <h2 className="px-2 text-xl font-medium">{m.nav_settings()}</h2>
            <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
                <nav
                    aria-label={m.nav_settings()}
                    className="flex gap-1 overflow-x-auto [scrollbar-width:none] md:sticky md:top-(--inset-top) md:flex-col md:self-start md:overflow-visible"
                >
                    {sections.map((s) => (
                        <Link
                            key={s.to}
                            to={s.to}
                            className="flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground [&_svg]:size-4"
                        >
                            <s.icon /> {s.label()}
                        </Link>
                    ))}
                </nav>
                <div className="grid min-w-0 content-start gap-4">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
