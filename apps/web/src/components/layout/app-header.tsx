import { useLocation, useParams } from '@tanstack/react-router';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { PrinterSwitcher } from '@/components/printer/printer-switcher';
import { usePinnedPrinter } from '@/hooks/use-pinned-printer';
import { usePrinters } from '@/hooks/use-printers';
import { greeting } from '@/lib/format';
import { m } from '@/lib/i18n';

const isDesktop =
    typeof window !== 'undefined' &&
    (window as unknown as { kobralinkDesktop?: { platform?: string } }).kobralinkDesktop?.platform === 'darwin';

interface AppHeaderProps {
    user: {
        name?: string | null;
        email: string;
    };
}

export function AppHeader({ user }: AppHeaderProps) {
    const { printerId } = useParams({ strict: false });
    const onPrintersHome = useLocation({ select: (l) => l.pathname === '/printers' || l.pathname === '/printers/' });
    const pinned = usePinnedPrinter();
    const { total, online, printing, pinnedState } = usePrinters((list) => {
        const live = list.find((p) => p.id === pinned)?.live;
        return {
            total: list.length,
            online: list.filter((p) => p.live?.connected).length,
            printing: list.filter((p) => p.live?.printState === 'printing').length,
            pinnedState: live?.printState === 'printing' ? 'printing' : live?.connected ? 'online' : 'offline',
        };
    });

    const firstName = (user.name || user.email.split('@')[0]).split(' ')[0];

    const subtitle = pinned
        ? pinnedState === 'printing'
            ? m.header_pinned_printing()
            : pinnedState === 'online'
              ? m.header_pinned_online()
              : m.header_pinned_offline()
        : !total
          ? m.header_no_printers()
          : printing
            ? m.header_printing({ printing, online, total })
            : m.header_online({ online, total });

    return (
        <header className={`flex flex-wrap items-center gap-4 px-2 pt-2 ${isDesktop ? 'app-drag' : ''}`}>
            <div>
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                    {m.header_greeting({ greeting: greeting(), name: firstName })}
                </h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
                {pinned ? null : printerId ? <PrinterSwitcher /> : onPrintersHome ? <AddPrinterDialog compact /> : null}
            </div>
        </header>
    );
}
