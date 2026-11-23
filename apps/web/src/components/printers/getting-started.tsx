import type { AppSettings } from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, type LinkProps } from '@tanstack/react-router';
import { Check, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePrinters } from '@/hooks/use-printers';
import { useCanOperate } from '@/hooks/use-role';
import type { PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const START_DISMISSED_KEY = 'kobralink:getting-started-hidden';

export interface StartItem {
    key: string;
    label: string;
    done: boolean;
    link: LinkProps;
}

export function startItems(printers: PrinterWithLive[], settings: AppSettings): StartItem[] {
    const first = printers[0];
    const profiled = printers.some((p) => {
        const profile = p.settings.profile;
        return profile.powerW !== null || profile.location !== '' || profile.tags.length > 0;
    });
    const n = settings.notifications;
    return [
        { key: 'printer', label: m.start_printer(), done: printers.length > 0, link: { to: '/setup' } },
        {
            key: 'profile',
            label: m.start_profile(),
            done: profiled,
            link: first ? { to: '/printers/$printerId/settings', params: { printerId: first.id } } : { to: '/setup' },
        },
        {
            key: 'publicUrl',
            label: m.start_public_url(),
            done: settings.publicUrl !== '',
            link: { to: '/settings/general' },
        },
        {
            key: 'spoolman',
            label: m.start_spoolman(),
            done: settings.spoolmanUrl !== '',
            link: { to: '/settings/integrations' },
        },
        {
            key: 'notifications',
            label: m.start_notifications(),
            done: Boolean(n.discordUrl || n.telegramToken || n.ntfyUrl || n.webhookUrl),
            link: { to: '/settings/notifications' },
        },
    ];
}

function readHidden(): boolean {
    try {
        return localStorage.getItem(START_DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
}

export function GettingStarted() {
    const printers = usePrinters();
    const settings = useQuery(appSettingsQuery).data;
    const canOperate = useCanOperate();
    const [hidden, setHidden] = useState(readHidden);
    if (!settings || !canOperate || hidden) return null;
    const items = startItems(printers, settings);
    const done = items.filter((i) => i.done).length;
    if (done === items.length) return null;
    const hide = () => {
        try {
            localStorage.setItem(START_DISMISSED_KEY, '1');
        } catch {}
        setHidden(true);
    };
    return (
        <Card className="rounded-3xl border-0 shadow-none">
            <CardHeader className="flex flex-row flex-wrap items-center gap-3">
                <CardTitle className="text-lg font-medium">{m.start_title()}</CardTitle>
                <span className="text-sm text-muted-foreground">{m.start_progress({ done, total: items.length })}</span>
                <Button variant="ghost" size="sm" className="ml-auto rounded-full" onClick={hide}>
                    {m.start_dismiss()}
                </Button>
            </CardHeader>
            <CardContent>
                <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => (
                        <li key={item.key}>
                            <Link
                                {...item.link}
                                className={cn(
                                    'flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3 text-sm transition-colors hover:bg-secondary',
                                    item.done && 'text-muted-foreground line-through',
                                )}
                            >
                                <span
                                    className={cn(
                                        'flex size-6 shrink-0 items-center justify-center rounded-full border',
                                        item.done
                                            ? 'border-transparent bg-primary text-primary-foreground'
                                            : 'border-border',
                                    )}
                                >
                                    {item.done && <Check className="size-3.5" />}
                                </span>
                                <span className="min-w-0 flex-1">{item.label}</span>
                                {!item.done && <ChevronRight className="size-4 text-muted-foreground" />}
                            </Link>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
