import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { BarChart3, Cable, LogOut, Printer, ScrollText, Settings2 } from 'lucide-react';
import { LanguageMenu } from '@/components/layout/language-menu';
import { Rail, RailButton, RailLink } from '@/components/layout/rail';
import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export function AppRail() {
    const qc = useQueryClient();
    const navigate = useNavigate();

    const logout = () =>
        alertConfirmationDialogStore.actions.openAlertDialog({
            title: m.logout_confirm_title(),
            description: m.logout_confirm_hint(),
            actionLabel: m.logout_confirm_action(),
            cancelLabel: m.logout_confirm_cancel(),
            onAction: async () => {
                await authClient.signOut();
                qc.setQueryData(['session'], null);
                await navigate({ to: '/login' });
            },
        });

    return (
        <Rail
            top={
                <>
                    <Link to="/" className="hidden rounded-2xl md:mb-1 md:block">
                        <img src="/logo-mark.svg" alt="Kobralink" className="size-12 rounded-2xl" />
                    </Link>
                    <RailLink to="/printers" title={m.nav_home()}>
                        <Printer />
                    </RailLink>
                </>
            }
            bottom={
                <>
                    <RailLink to="/slicer" title={m.nav_slicer()}>
                        <Cable />
                    </RailLink>
                    <RailLink to="/stats" title={m.nav_stats()}>
                        <BarChart3 />
                    </RailLink>
                    <RailLink to="/settings" title={m.nav_bridge_settings()}>
                        <Settings2 />
                    </RailLink>
                    <RailLink to="/logs" title={m.nav_logs()}>
                        <ScrollText />
                    </RailLink>
                    <LanguageMenu />
                    <RailButton
                        title={m.nav_logout()}
                        onClick={logout}
                        className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                    >
                        <LogOut />
                    </RailButton>
                </>
            }
        />
    );
}
