import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppHeader } from '@/components/layout/app-header';
import { AppRail } from '@/components/layout/app-rail';
import { useDesktopNavigation } from '@/hooks/use-desktop-navigation';
import { useGlobalEvents } from '@/hooks/use-global-events';
import { usePrintersSync } from '@/hooks/use-printers-sync';
import { sessionQuery } from '@/lib/session';

export const Route = createFileRoute('/_app')({
    beforeLoad: async ({ context, location }) => {
        const session = await context.queryClient.query({ ...sessionQuery, staleTime: 'static' });
        if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
        return { session };
    },
    component: AppLayout,
});

function AppLayout() {
    const { session } = Route.useRouteContext();

    usePrintersSync();
    useGlobalEvents();
    useDesktopNavigation();

    return (
        <div className="flex min-h-svh gap-4 p-4 pt-(--inset-top)">
            <AppRail />
            <div className="flex min-w-0 flex-1 flex-col gap-6">
                <AppHeader user={session.user} />
                <main className="min-w-0 flex-1">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
