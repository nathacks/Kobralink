import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { BarChart3, LayoutGrid, LogOut, Printer, ScrollText, Settings2 } from 'lucide-react';
import { useEffect } from 'react';
import { LanguageMenu } from '@/components/layout/language-menu';
import { Rail, RailButton, RailLink } from '@/components/layout/rail';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { PrinterSwitcher } from '@/components/printer/printer-switcher';
import { useGlobalEvents } from '@/hooks/use-global-events';
import { usePrinters } from '@/hooks/use-printers';
import { usePrintersSync } from '@/hooks/use-printers-sync';
import { authClient } from '@/lib/auth-client';
import { greeting } from '@/lib/format';
import { m } from '@/lib/i18n';
import { sessionQuery } from '@/lib/session';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export const Route = createFileRoute('/_app')({
    beforeLoad: async ({ context, location }) => {
        const session = await context.queryClient.query({ ...sessionQuery, staleTime: 'static' });
        if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
        return { session };
    },
    component: AppLayout,
});

const isDesktop = typeof window !== 'undefined' && 'kobralinkDesktop' in window;

function AppLayout() {
    const { session } = Route.useRouteContext();
    const qc = useQueryClient();
    const navigate = useNavigate();
    usePrintersSync();
    useGlobalEvents();
    const printers = usePrinters();
    useEffect(() => {
        const onNav = (ev: Event) => {
            const to = (ev as CustomEvent<string>).detail;
            if (typeof to === 'string') void navigate({ to });
        };
        window.addEventListener('kobralink:navigate', onNav);
        return () => window.removeEventListener('kobralink:navigate', onNav);
    }, [navigate]);
    const { printerId } = useParams({ strict: false });
    const onPrintersHome = useLocation({ select: (l) => l.pathname === '/printers' || l.pathname === '/printers/' });
    const online = printers.filter((p) => p.live?.connected).length ?? 0;
    const printing = printers.filter((p) => p.live?.printState === 'printing').length ?? 0;
    const firstName = (session.user.name || session.user.email.split('@')[0]).split(' ')[0];

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

    const subtitle = !printers.length
        ? m.header_no_printers()
        : printing
          ? m.header_printing({ printing, online, total: printers.length })
          : m.header_online({ online, total: printers.length });

    return (
        <div className="flex min-h-svh gap-4 p-4 pt-(--inset-top)">
            <Rail
                top={
                    <>
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
            <div className="flex min-w-0 flex-1 flex-col gap-6">
                <header className={`flex flex-wrap items-center gap-4 px-2 pt-2 ${isDesktop ? 'app-drag' : ''}`}>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {m.header_greeting({ greeting: greeting(), name: firstName })}
                        </h1>
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        {printerId ? <PrinterSwitcher /> : onPrintersHome ? <AddPrinterDialog compact /> : null}
                    </div>
                </header>
                <main className="min-w-0 flex-1 pb-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
