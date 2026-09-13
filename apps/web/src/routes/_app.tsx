import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { LayoutGrid, LogOut, Printer } from 'lucide-react';
import { useEffect } from 'react';
import { Avatar } from '@/components/layout/avatar';
import { Rail, RailButton, RailLink } from '@/components/layout/rail';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { authClient } from '@/lib/auth-client';
import { greeting } from '@/lib/format';
import { printersQuery } from '@/lib/queries';
import { sessionQuery } from '@/lib/session';
import { usePrintersStore } from '@/stores/printers';

export const Route = createFileRoute('/_app')({
    beforeLoad: async ({ context, location }) => {
        const session = await context.queryClient.ensureQueryData(sessionQuery);
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
    const printers = useQuery(printersQuery);
    const setPrinters = usePrintersStore((s) => s.setPrinters);

    useEffect(() => {
        if (printers.data) setPrinters(printers.data);
    }, [printers.data, setPrinters]);

    const online = printers.data?.filter((p) => p.live?.connected).length ?? 0;
    const printing = printers.data?.filter((p) => p.live?.printState === 'printing').length ?? 0;
    const firstName = (session.user.name || session.user.email.split('@')[0]).split(' ')[0];

    const logout = async () => {
        await authClient.signOut();
        qc.setQueryData(['session'], null);
        await navigate({ to: '/login' });
    };

    const subtitle = !printers.data?.length
        ? 'Ajoutez votre première imprimante pour commencer.'
        : printing
          ? `${printing} impression${printing > 1 ? 's' : ''} en cours · ${online}/${printers.data.length} en ligne`
          : `${online}/${printers.data.length} imprimante${printers.data.length > 1 ? 's' : ''} en ligne`;

    return (
        <div className="flex min-h-svh gap-4 p-4 pt-(--inset-top)">
            <Rail
                top={
                    <>
                        <div className="mb-2 flex size-12 items-center justify-center text-primary">
                            <Link to="/printers" title="Kobralink" aria-label="Kobralink">
                                <KobraMark />
                            </Link>
                        </div>
                        <RailLink to="/printers" activeOptions={{ exact: true }} title="Accueil">
                            <LayoutGrid />
                        </RailLink>
                        {printers.data?.map((p) => (
                            <RailLink
                                key={p.id}
                                to="/printers/$printerId"
                                params={{ printerId: p.id }}
                                title={p.name}
                                className="relative"
                            >
                                <Printer />
                                <span
                                    className={`absolute right-2 top-2 size-2 rounded-full ring-2 ring-sidebar ${p.live?.connected ? 'bg-primary' : 'bg-muted-foreground/50'}`}
                                />
                            </RailLink>
                        ))}
                    </>
                }
                bottom={
                    <>
                        <RailButton title="Déconnexion" onClick={logout}>
                            <LogOut />
                        </RailButton>
                        <Avatar name={session.user.name} email={session.user.email} />
                    </>
                }
            />
            <div className="flex min-w-0 flex-1 flex-col gap-6">
                <header className={`flex flex-wrap items-center gap-4 px-2 pt-2 ${isDesktop ? 'app-drag' : ''}`}>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {greeting()}, {firstName} !
                        </h1>
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <AddPrinterDialog compact />
                    </div>
                </header>
                <main className="min-w-0 flex-1 pb-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

function KobraMark() {
    return (
        <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" role="img" aria-label="Kobralink">
            <path d="M5 3h4v7.2l6.2-7.2h4.9l-7.4 8.4L21 21h-5l-5.6-6.6L9 16.1V21H5z" />
        </svg>
    );
}
