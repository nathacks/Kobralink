import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { AlertConfirmationDialog } from '@/components/dialogs/alert-confirmation-dialog';
import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Toaster } from '@/components/ui/sonner';
import { installI18n, m, useLocale } from '@/lib/i18n';
import { createQueryClient } from '@/lib/query-client';
import { installTheme } from '@/stores/theme';
import { routeTree } from './routeTree.gen';
import './styles.css';

type DesktopUpdateStatus =
    | { state: 'downloading'; version: string; percent: number }
    | { state: 'downloaded'; version: string }
    | { state: 'error'; message: string };

const desktop = (
    window as unknown as {
        kobralinkDesktop?: {
            platform?: string;
            onUpdateStatus?: (cb: (status: DesktopUpdateStatus) => void) => () => void;
            installUpdate?: () => Promise<void>;
        };
    }
).kobralinkDesktop;
if (desktop) document.documentElement.classList.add('desktop');
if (desktop?.platform === 'darwin') document.documentElement.classList.add('desktop-mac');
installI18n();
desktop?.onUpdateStatus?.((s) => {
    const id = 'desktop-update';
    if (s.state === 'downloading') {
        toast.loading(m.desktop_update_downloading({ version: s.version, percent: s.percent }), {
            id,
            duration: Number.POSITIVE_INFINITY,
        });
    } else if (s.state === 'downloaded') {
        toast.success(m.desktop_update_ready_body({ version: s.version }), {
            id,
            duration: Number.POSITIVE_INFINITY,
            action: { label: m.desktop_update_restart(), onClick: () => void desktop.installUpdate?.() },
        });
    } else {
        toast.error(m.desktop_update_error_title(), { id, description: s.message, duration: 10_000 });
    }
});
installTheme();

const queryClient = createQueryClient();

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
