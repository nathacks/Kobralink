import { useNavigate, useParams } from '@tanstack/react-router';
import { Check, ChevronDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePrinters } from '@/hooks/use-printers';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function PrinterSwitcher() {
    const navigate = useNavigate();
    const printers = usePrinters();
    const { printerId: selectedId } = useParams({ strict: false });
    const current = printers.find((p) => p.id === selectedId);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="rounded-full pr-3 pl-4">
                    <Printer />
                    <span className="max-w-48 truncate">{current?.name ?? m.switcher_placeholder()}</span>
                    <ChevronDown className="opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56 rounded-2xl">
                <DropdownMenuLabel>{m.switcher_label()}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {printers.map((p) => (
                    <DropdownMenuItem
                        key={p.id}
                        className="rounded-xl"
                        onSelect={() => navigate({ to: '/printers/$printerId', params: { printerId: p.id } })}
                    >
                        <span
                            className={cn(
                                'size-2 shrink-0 rounded-full',
                                p.live?.connected ? 'bg-primary' : 'bg-muted-foreground/50',
                            )}
                        />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {p.id === selectedId && <Check className="size-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
