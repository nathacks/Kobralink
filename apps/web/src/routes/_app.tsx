import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { AppHeader } from '@/components/layout/app-header';
import { AppRail } from '@/components/layout/app-rail';
import { SseProvider } from '@/components/providers/sse-provider';
import { useDesktopNavigation } from '@/hooks/use-desktop-navigation';
import { usePinnedPrinter } from '@/hooks/use-pinned-printer';
import { usePrintersSync } from '@/hooks/use-printers-sync';
import { printersQuery } from '@/lib/queries';
import { sessionQuery } from '@/lib/session';
import { pinnedPrinterStore } from '@/stores/pinned-printer';

const searchSchema = z.object({ pin: z.literal(1).optional() });

export const Route = createFileRoute('/_app')({
    validateSearch: searchSchema,
    beforeLoad: async ({ context, location, search }) => {
        const session = await context.queryClient.query({ ...sessionQuery, staleTime: 'static' });
        if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });

        const current = location.pathname.match(/^\/printers\/([^/]+)/)?.[1];
        if (search.pin && current) {
            pinnedPrinterStore.actions.pin(current);
            throw redirect({ to: '/printers/$printerId', params: { printerId: current }, replace: true });
        }
        const pinned = pinnedPrinterStore.state.id;
        if (pinned && current !== pinned) {
            const printers = await context.queryClient.query({ ...printersQuery, staleTime: 'static' });
            if (printers.some((p) => p.id === pinned)) {
                throw redirect({ to: '/printers/$printerId', params: { printerId: pinned }, replace: true });
            }
            pinnedPrinterStore.actions.unpin();
        }
        return { session };
    },
    component: AppLayout,
});

function AppLayout() {
    const { session } = Route.useRouteContext();
    const pinned = usePinnedPrinter();

    usePrintersSync();
    useDesktopNavigation();

    return (
        <SseProvider>
            <div className="flex min-h-svh gap-4 p-4 pt-(--inset-top)">
                {!pinned && <AppRail />}
                <div className="flex min-w-0 flex-1 flex-col gap-6">
                    <AppHeader user={session.user} />
                    <main className="min-w-0 flex-1">
                        <Outlet />
                    </main>
                </div>
            </div>
        </SseProvider>
    );
}
