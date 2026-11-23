import { createFileRoute, Navigate } from '@tanstack/react-router';
import { UsersCard } from '@/components/settings/users-card';
import { useIsAdmin } from '@/hooks/use-role';

export const Route = createFileRoute('/_app/settings/users')({ component: UsersSettingsPage });

function UsersSettingsPage() {
    if (!useIsAdmin()) return <Navigate to="/settings/general" replace />;
    return <UsersCard />;
}
