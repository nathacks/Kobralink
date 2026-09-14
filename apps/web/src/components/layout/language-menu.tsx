import { Check, Languages } from 'lucide-react';
import { RailButton } from '@/components/layout/rail';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getLocale, LOCALE_LABEL, locales, m, setLocale } from '@/lib/i18n';

export function LanguageMenu() {
    const current = getLocale();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <RailButton title={m.common_language()}>
                    <Languages />
                </RailButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="min-w-40 rounded-2xl">
                {locales.map((l) => (
                    <DropdownMenuItem key={l} className="rounded-xl" onSelect={() => setLocale(l)}>
                        <span className="flex-1">{LOCALE_LABEL[l]()}</span>
                        {l === current && <Check className="size-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
