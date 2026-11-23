import type { LinkProps } from '@tanstack/react-router';
import {
    BarChart3,
    Disc3,
    FileStack,
    History,
    ListOrdered,
    type LucideIcon,
    Printer,
    Settings2,
    Workflow,
    Wrench,
} from 'lucide-react';
import { m } from '@/lib/i18n';

export interface NavItem {
    to: NonNullable<LinkProps['to']>;
    icon: LucideIcon;
    label: () => string;
    mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
    { to: '/printers', icon: Printer, label: m.nav_home, mobile: true },
    { to: '/queue', icon: ListOrdered, label: m.nav_queue, mobile: true },
    { to: '/files', icon: FileStack, label: m.nav_files, mobile: true },
    { to: '/history', icon: History, label: m.nav_history },
    { to: '/stats', icon: BarChart3, label: m.nav_stats, mobile: true },
    { to: '/filament', icon: Disc3, label: m.nav_filament },
    { to: '/maintenance', icon: Wrench, label: m.nav_maintenance },
    { to: '/automations', icon: Workflow, label: m.nav_automations },
];

export const SETTINGS_ITEM: NavItem = { to: '/settings', icon: Settings2, label: m.nav_settings };

export const MOBILE_ITEMS = NAV_ITEMS.filter((item) => item.mobile);
export const MORE_ITEMS = [...NAV_ITEMS.filter((item) => !item.mobile), SETTINGS_ITEM];
