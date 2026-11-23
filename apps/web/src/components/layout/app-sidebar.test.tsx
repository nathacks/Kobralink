import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { sidebarStore } from '@/stores/sidebar';
import { themeStore } from '@/stores/theme';
import { renderWithProviders } from '@/test/render';
import { AppSidebar } from './app-sidebar';
import { initials } from './user-menu';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({ authClient: { signOut } }));

const user = { name: 'Ada Lovelace', email: 'ada@example.com' };

function desktop() {
    return screen.getByRole('complementary');
}

function mobileNav() {
    const navs = screen.getAllByRole('navigation', { name: m.nav_main() });
    const nav = navs.find((n) => !desktop().contains(n));
    if (!nav) throw new Error('mobile navigation not rendered');
    return nav;
}

beforeEach(() => {
    localStorage.clear();
    if (sidebarStore.state.collapsed) sidebarStore.actions.toggle();
    themeStore.actions.setPreference('system');
    alertConfirmationDialogStore.actions.closeAlertDialog();
    signOut.mockReset().mockResolvedValue(undefined);
});

describe('initials', () => {
    it('uses the first and last name', () => {
        expect(initials({ name: 'Ada King Lovelace', email: 'a@b.c' })).toBe('AL');
    });

    it('falls back to the email when there is no name', () => {
        expect(initials({ name: null, email: 'operator@farm.local' })).toBe('OP');
        expect(initials({ name: '  ', email: 'x@y.z' })).toBe('X');
    });
});

describe('AppSidebar', () => {
    it('labels every section and the user', async () => {
        await renderWithProviders(<AppSidebar user={user} />);
        const aside = desktop();
        for (const label of [
            m.nav_home(),
            m.nav_queue(),
            m.nav_files(),
            m.nav_history(),
            m.nav_filament(),
            m.nav_stats(),
            m.nav_maintenance(),
            m.nav_automations(),
            m.nav_settings(),
        ]) {
            expect(within(aside).getByRole('link', { name: label })).toBeTruthy();
        }
        expect(within(aside).getByText('Ada Lovelace')).toBeTruthy();
        expect(within(aside).getByText('ada@example.com')).toBeTruthy();
    });

    it('marks the current section as active', async () => {
        await renderWithProviders(<AppSidebar user={user} />, { path: '/stats' });
        const stats = within(desktop()).getByRole('link', { name: m.nav_stats() });
        expect(stats.getAttribute('data-status')).toBe('active');
        const printers = within(desktop()).getByRole('link', { name: m.nav_home() });
        expect(printers.getAttribute('data-status')).toBeNull();
    });

    it('collapses to icons and keeps the names as tooltips', async () => {
        await renderWithProviders(<AppSidebar user={user} />);
        await userEvent.click(within(desktop()).getByRole('button', { name: m.nav_collapse() }));
        expect(sidebarStore.state.collapsed).toBe(true);
        expect(within(desktop()).queryByText(m.nav_stats())).toBeNull();
        expect(within(desktop()).getByRole('link', { name: m.nav_stats() }).getAttribute('aria-label')).toBe(
            m.nav_stats(),
        );
        expect(within(desktop()).queryByText('Ada Lovelace')).toBeNull();
        await userEvent.click(within(desktop()).getByRole('button', { name: m.nav_expand() }));
        expect(within(desktop()).getByText(m.nav_stats())).toBeTruthy();
    });

    it('shows the sections and a More menu on phones', async () => {
        await renderWithProviders(<AppSidebar user={user} />);
        const nav = mobileNav();
        for (const label of [m.nav_home(), m.nav_queue(), m.nav_files(), m.nav_stats()]) {
            expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
        }
        expect(within(nav).queryByRole('link', { name: m.nav_settings() })).toBeNull();
        expect(within(nav).queryByRole('link', { name: m.nav_filament() })).toBeNull();
        await userEvent.click(within(nav).getByRole('button', { name: m.nav_more() }));
        const settings = await screen.findByRole('menuitem', { name: m.nav_settings() });
        expect(settings.getAttribute('href')).toBe('/settings');
        for (const label of [m.nav_history(), m.nav_filament(), m.nav_maintenance(), m.nav_automations()]) {
            expect(screen.getByRole('menuitem', { name: label })).toBeTruthy();
        }
        expect(screen.getByRole('menuitem', { name: m.nav_logout() })).toBeTruthy();
    });

    it('keeps settings out of the account menu on desktop', async () => {
        await renderWithProviders(<AppSidebar user={user} />);
        await userEvent.click(within(desktop()).getByRole('button', { name: m.nav_account() }));
        await screen.findByRole('menuitem', { name: m.nav_logout() });
        expect(screen.queryByRole('menuitem', { name: m.nav_settings() })).toBeNull();
    });

    it('switches the theme from the account menu', async () => {
        await renderWithProviders(<AppSidebar user={user} />);
        await userEvent.click(within(desktop()).getByRole('button', { name: m.nav_account() }));
        await userEvent.click(await screen.findByRole('menuitem', { name: m.theme_label() }));
        await userEvent.click(await screen.findByRole('menuitemradio', { name: m.theme_dark() }));
        expect(themeStore.state.preference).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('asks for confirmation before logging out', async () => {
        await renderWithProviders(<AppSidebar user={user} />);
        await userEvent.click(within(desktop()).getByRole('button', { name: m.nav_account() }));
        await userEvent.click(await screen.findByRole('menuitem', { name: m.nav_logout() }));
        const dialog = alertConfirmationDialogStore.state;
        expect(dialog.isOpen).toBe(true);
        expect(dialog.title).toBe(m.logout_confirm_title());
        expect(signOut).not.toHaveBeenCalled();
        await dialog.onAction?.();
        expect(signOut).toHaveBeenCalledOnce();
    });
});
