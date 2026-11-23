import { createFileRoute, redirect } from '@tanstack/react-router';
import { SetupWizard } from '@/components/setup/setup-wizard';
import { setupQuery } from '@/lib/queries';
import { sessionQuery } from '@/lib/session';

export const Route = createFileRoute('/setup')({
    beforeLoad: async ({ context }) => {
        const status = await context.queryClient.fetchQuery(setupQuery);
        if (status.needsSetup) return { needsAccount: true };
        const session = await context.queryClient.query({ ...sessionQuery, staleTime: 'static' });
        if (!session) throw redirect({ to: '/login', search: { redirect: '/setup' } });
        if (session.user.role !== 'admin') throw redirect({ to: '/printers' });
        return { needsAccount: false };
    },
    component: SetupPage,
});

function SetupPage() {
    const { needsAccount } = Route.useRouteContext();
    return <SetupWizard needsAccount={needsAccount} />;
}
