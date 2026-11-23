import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/logs')({
    beforeLoad: () => {
        throw redirect({ to: '/settings/logs', replace: true });
    },
});
