import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/slicer')({
    beforeLoad: () => {
        throw redirect({ to: '/settings/slicer', replace: true });
    },
});
