import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLocale, m, setLocale } from '@/lib/i18n';
import { themeStore } from '@/stores/theme';
import { renderWithProviders } from '@/test/render';
import { AppearanceCard } from './appearance-card';

beforeEach(() => {
    localStorage.clear();
    themeStore.actions.setPreference('system');
});

afterEach(() => {
    setLocale('en');
});

describe('AppearanceCard', () => {
    it('shows the current theme as pressed', async () => {
        await renderWithProviders(<AppearanceCard />);
        expect(screen.getByRole('button', { name: m.theme_system() }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: m.theme_light() }).getAttribute('aria-pressed')).toBe('false');
    });

    it('applies and remembers each theme', async () => {
        await renderWithProviders(<AppearanceCard />);
        await userEvent.click(screen.getByRole('button', { name: m.theme_dark() }));
        expect(themeStore.state.preference).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorage.getItem('kobralink:theme')).toBe('dark');
        await userEvent.click(screen.getByRole('button', { name: m.theme_light() }));
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(screen.getByRole('button', { name: m.theme_light() }).getAttribute('aria-pressed')).toBe('true');
    });

    it('changes the interface language', async () => {
        await renderWithProviders(<AppearanceCard />);
        await userEvent.click(screen.getByRole('combobox', { name: m.appearance_language() }));
        await userEvent.click(await screen.findByRole('option', { name: m.locale_pt_br() }));
        expect(getLocale()).toBe('pt-br');
    });
});
