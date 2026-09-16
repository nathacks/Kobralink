import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { AlertConfirmationDialog } from '@/components/dialogs/alert-confirmation-dialog';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Toaster } from '@/components/ui/sonner';
import { installI18n, useLocale } from '@/lib/i18n';
import { routeTree } from './routeTree.gen';
import 'react-grid-layout/css/styles.css';
import './styles.css';

const desktop = (window as unknown as { kobralinkDesktop?: { platform?: string } }).kobralinkDesktop;
if (desktop) document.documentElement.classList.add('desktop');
if (desktop?.platform === 'darwin') document.documentElement.classList.add('desktop-mac');
installI18n();

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
    mutationCache: new MutationCache({
        onError: (error, _vars, _ctx, mutation) => {
            console.error('[kobralink] mutation failed', error);
            if (mutation.options.onError || mutation.meta?.silent) return;
            toast.error(error.message);
        },
    }),
    queryCache: new QueryCache({
        onError: (error, query) => {
            console.error('[kobralink] query failed', query.queryKey, error);
            if (query.meta?.silent) return;
            toast.error(error.message, { id: `query:${query.queryHash}` });
        },
    }),
});

const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
});

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}

function App() {
    const locale = useLocale();
    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider key={locale} router={router} />
            <Toaster position="bottom-right" />
            <ConfirmationDialog />
            <AlertConfirmationDialog />
        </QueryClientProvider>
    );
}

createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
