import { useLocation, useParams } from '@tanstack/react-router';
import { AddPrinterDialog } from '@/components/printer/add-printer-dialog';
import { PrinterSwitcher } from '@/components/printer/printer-switcher';
import { usePinnedPrinter } from '@/hooks/use-pinned-printer';
import { usePrinters } from '@/hooks/use-printers';
import { greeting } from '@/lib/format';
import { m } from '@/lib/i18n';

const isDesktop = typeof window !== 'undefined' && 'kobralinkDesktop' in window;

interface AppHeaderProps {
    user: {
        name?: string | null;
        email: string;
    };
}

export function AppHeader({ user }: AppHeaderProps) {
    const { printerId } = useParams({ strict: false });
    const onPrintersHome = useLocation({ select: (l) => l.pathname === '/printers' || l.pathname === '/printers/' });
    const printers = usePrinters();
    const pinned = usePinnedPrinter();

    const online = printers.filter((p) => p.live?.connected).length ?? 0;
    const printing = printers.filter((p) => p.live?.printState === 'printing').length ?? 0;
    const firstName = (user.name || user.email.split('@')[0]).split(' ')[0];

    const subtitle = !printers.length
        ? m.header_no_printers()
        : printing
          ? m.header_printing({ printing, online, total: printers.length })
          : m.header_online({ online, total: printers.length });

    return (
        <header className={`flex flex-wrap items-center gap-4 px-2 pt-2 ${isDesktop ? 'app-drag' : ''}`}>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">
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
