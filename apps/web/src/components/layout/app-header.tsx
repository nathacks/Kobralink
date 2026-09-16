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
    const printers = usePrinters();
    const pinned = usePinnedPrinter();

    const online = printers.filter((p) => p.live?.connected).length ?? 0;
    const printing = printers.filter((p) => p.live?.printState === 'printing').length ?? 0;
    const firstName = (user.name || user.email.split('@')[0]).split(' ')[0];

    const current = pinned ? printers.find((p) => p.id === pinned) : undefined;
    const subtitle = pinned
        ? current?.live?.printState === 'printing'
            ? m.header_pinned_printing()
            : current?.live?.connected
              ? m.header_pinned_online()
              : m.header_pinned_offline()
        : !printers.length
          ? m.header_no_printers()
          : printing
            ? m.header_printing({ printing, online, total: printers.length })
            : m.header_online({ online, total: printers.length });

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
