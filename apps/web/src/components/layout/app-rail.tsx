import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BarChart3, Cable, LayoutGrid, LogOut, Printer, ScrollText, Settings2 } from 'lucide-react';
import { LanguageMenu } from '@/components/layout/language-menu';
import { Rail, RailButton, RailLink } from '@/components/layout/rail';
import { usePrinters } from '@/hooks/use-printers';
import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export function AppRail() {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const printers = usePrinters();

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
                    <img src="/logo-mark.svg" alt="Kobralink" className="mb-1 size-12 rounded-2xl" />
                    <RailLink to="/printers" activeOptions={{ exact: true }} title={m.nav_home()}>
                        <LayoutGrid />
                    </RailLink>
                    {printers.map((p) => (
                        <RailLink
                            key={p.id}
                            to="/printers/$printerId"
                            params={{ printerId: p.id }}
                            title={p.name}
                            className="relative"
                        >
                            <Printer />
                        </RailLink>
                    ))}
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
