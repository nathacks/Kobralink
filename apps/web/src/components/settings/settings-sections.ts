import type { LinkProps } from '@tanstack/react-router';
import {
    Bell,
    Cable,
    type LucideIcon,
    Plug,
    ScanEye,
    ScrollText,
    Server,
    SlidersHorizontal,
    Users,
    Zap,
} from 'lucide-react';
import { m } from '@/lib/i18n';

export interface SettingsSection {
    to: NonNullable<LinkProps['to']>;
    icon: LucideIcon;
    label: () => string;
    adminOnly?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
    { to: '/settings/general', icon: SlidersHorizontal, label: m.settings_tab_general },
    { to: '/settings/notifications', icon: Bell, label: m.settings_tab_notifications },
    { to: '/settings/detection', icon: ScanEye, label: m.settings_tab_detection },
    { to: '/settings/integrations', icon: Plug, label: m.settings_tab_integrations },
    { to: '/settings/slicer', icon: Cable, label: m.settings_tab_slicer },
    { to: '/settings/macros', icon: Zap, label: m.settings_tab_macros },
    { to: '/settings/users', icon: Users, label: m.settings_tab_users, adminOnly: true },
    { to: '/settings/system', icon: Server, label: m.settings_tab_system },
    { to: '/settings/logs', icon: ScrollText, label: m.nav_logs },
];

export function visibleSections(isAdmin: boolean): SettingsSection[] {
    return SETTINGS_SECTIONS.filter((s) => !s.adminOnly || isAdmin);
}

export const LEGACY_SETTINGS_TABS = {
    general: '/settings/general',
    notifications: '/settings/notifications',
    detection: '/settings/detection',
    integrations: '/settings/integrations',
    filament: '/filament',
    macros: '/settings/macros',
    users: '/settings/users',
    system: '/settings/system',
} as const;

export type LegacySettingsTab = keyof typeof LEGACY_SETTINGS_TABS;

export function legacySettingsPath(tab: LegacySettingsTab | undefined) {
    return tab ? LEGACY_SETTINGS_TABS[tab] : '/settings/general';
}
