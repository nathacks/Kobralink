import { Link } from '@tanstack/react-router';
import { useSelector } from '@tanstack/react-store';
import { ChevronsUpDown, Ellipsis, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cloneElement } from 'react';
import { MOBILE_ITEMS, MORE_ITEMS, NAV_ITEMS, type NavItem, SETTINGS_ITEM } from '@/components/layout/nav-items';
import { initials, type MenuUser, UserMenu } from '@/components/layout/user-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { sidebarStore } from '@/stores/sidebar';

const linkBase =
    'flex h-11 shrink-0 items-center gap-3 rounded-full px-3.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground [&_svg]:size-5 [&_svg]:shrink-0';

function SideTip({
    label,
    show,
    children: child,
    ...triggerProps
}: { label: string; show: boolean; children: React.ReactElement } & Record<string, unknown>) {
    const children = cloneElement(child, triggerProps);
    if (!show) return children;
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                    {label}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
    const label = item.label();
    return (
        <SideTip label={label} show={collapsed}>
            <Link
                to={item.to}
                aria-label={collapsed ? label : undefined}
                className={cn(linkBase, collapsed && 'w-11 justify-center px-0')}
            >
                <item.icon />
                {!collapsed && <span className="truncate">{label}</span>}
            </Link>
        </SideTip>
    );
}

function Avatar({ user, className }: { user: MenuUser; className?: string }) {
    return (
        <span
            className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-strong',
                className,
            )}
        >
            {initials(user)}
        </span>
    );
}

function DesktopSidebar({ user }: { user: MenuUser }) {
    const collapsed = useSelector(sidebarStore, (s) => s.collapsed);
    const toggleLabel = collapsed ? m.nav_expand() : m.nav_collapse();
    return (
        <aside
            data-collapsed={collapsed}
            className={cn(
                'sticky top-(--inset-top) hidden h-[calc(100svh-var(--inset-top)-1rem)] shrink-0 flex-col gap-2 rounded-3xl bg-sidebar p-3 transition-[width] duration-200 md:flex',
                collapsed ? 'w-17' : 'w-60',
            )}
        >
            <div className={cn('flex items-center gap-2 pb-2', collapsed ? 'flex-col' : 'pl-1')}>
                <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-2xl">
                    <img src="/logo-mark.svg" alt="" className="size-10 shrink-0 rounded-xl" />
                    {!collapsed && <span className="truncate text-base font-semibold tracking-tight">Kobralink</span>}
                </Link>
                <SideTip label={toggleLabel} show={collapsed}>
                    <button
                        type="button"
                        onClick={() => sidebarStore.actions.toggle()}
                        title={collapsed ? undefined : toggleLabel}
                        aria-label={toggleLabel}
                        aria-expanded={!collapsed}
                        className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-4.5',
                            !collapsed && 'ml-auto',
                        )}
                    >
                        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                    </button>
                </SideTip>
            </div>
            <nav aria-label={m.nav_main()} className="flex flex-1 flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                    <SidebarLink key={item.to} item={item} collapsed={collapsed} />
                ))}
            </nav>
            <div className="flex flex-col gap-1">
                <SidebarLink item={SETTINGS_ITEM} collapsed={collapsed} />
                <UserMenu user={user} side="right">
                    <SideTip label={m.nav_account()} show={collapsed}>
                        <button
                            type="button"
                            aria-label={m.nav_account()}
                            className={cn(
                                'flex items-center gap-3 rounded-full p-1 text-left transition-colors hover:bg-sidebar-accent',
                                collapsed ? 'justify-center' : 'pr-3',
                            )}
                        >
                            <Avatar user={user} />
                            {!collapsed && (
                                <>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">
                                            {user.name || user.email}
                                        </span>
                                        {user.name && (
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {user.email}
                                            </span>
                                        )}
                                    </span>
                                    <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                                </>
                            )}
                        </button>
                    </SideTip>
                </UserMenu>
            </div>
        </aside>
    );
}

const mobileLink =
    'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium text-sidebar-foreground/70 transition-colors data-[status=active]:text-primary-strong [&_svg]:size-5';

function MobileNav({ user }: { user: MenuUser }) {
    return (
        <nav
            aria-label={m.nav_main()}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex h-16 items-stretch gap-1 rounded-3xl bg-sidebar px-2 shadow-xl shadow-black/30 md:hidden"
        >
            {MOBILE_ITEMS.map((item) => (
                <Link key={item.to} to={item.to} className={mobileLink}>
                    <item.icon />
                    <span className="max-w-full truncate">{item.label()}</span>
                </Link>
            ))}
            <UserMenu user={user} side="top" links={MORE_ITEMS}>
                <button type="button" className={mobileLink}>
                    <Ellipsis />
                    <span>{m.nav_more()}</span>
                </button>
            </UserMenu>
        </nav>
    );
}

export function AppSidebar({ user }: { user: MenuUser }) {
    return (
        <>
            <DesktopSidebar user={user} />
            <MobileNav user={user} />
        </>
    );
}
