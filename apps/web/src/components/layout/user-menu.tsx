import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Languages, LogOut, Monitor, Moon, Palette, Sun } from 'lucide-react';
import type { NavItem } from '@/components/layout/nav-items';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemePreference } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { LOCALE_LABEL, type Locale, locales, m, setLocale, useLocale } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { type ThemePreference, themeStore } from '@/stores/theme';

export interface MenuUser {
    name?: string | null;
    email: string;
}

export const THEME_OPTIONS: { value: ThemePreference; icon: typeof Sun; label: () => string }[] = [
    { value: 'system', icon: Monitor, label: m.theme_system },
    { value: 'light', icon: Sun, label: m.theme_light },
    { value: 'dark', icon: Moon, label: m.theme_dark },
];

export function initials(user: MenuUser): string {
    const source = user.name?.trim() || user.email.split('@')[0];
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : source.slice(0, 2);
    return letters.toUpperCase();
}

export function UserMenu({
    user,
    side,
    links = [],
    children,
}: {
    user: MenuUser;
    side: 'top' | 'right';
    links?: NavItem[];
    children: React.ReactNode;
}) {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const theme = useThemePreference();
    const locale = useLocale();

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
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent side={side} align="end" className="min-w-56 rounded-2xl">
                <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-medium">{user.name || user.email}</div>
                    {user.name && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {links.map((item) => (
                    <DropdownMenuItem key={item.to} asChild className="rounded-xl">
                        <Link to={item.to}>
                            <item.icon className="size-4" /> {item.label()}
                        </Link>
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="rounded-xl">
                        <Palette className="size-4" /> {m.theme_label()}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="rounded-2xl">
                        <DropdownMenuRadioGroup
                            value={theme}
                            onValueChange={(v) => themeStore.actions.setPreference(v as ThemePreference)}
                        >
                            {THEME_OPTIONS.map((o) => (
                                <DropdownMenuRadioItem key={o.value} value={o.value} className="rounded-xl">
                                    <o.icon className="size-4" /> {o.label()}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="rounded-xl">
                        <Languages className="size-4" /> {m.common_language()}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="rounded-2xl">
                        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                            {locales.map((l) => (
                                <DropdownMenuRadioItem key={l} value={l} className="rounded-xl">
                                    {LOCALE_LABEL[l]()}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="rounded-xl" onSelect={logout}>
                    <LogOut className="size-4" /> {m.nav_logout()}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
