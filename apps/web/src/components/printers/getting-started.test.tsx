import { type AppSettings, appSettingsSchema, printerSettingsSchema } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { GettingStarted, START_DISMISSED_KEY, startItems } from './getting-started';

const holder = vi.hoisted(() => ({ printers: [] as PrinterWithLive[] }));

vi.mock('@/hooks/use-printers', () => ({ usePrinterList: () => holder.printers }));

const blank = appSettingsSchema.parse({});
const printer = (profile = {}) =>
    ({ id: 'p1', name: 'Kobra 4', settings: printerSettingsSchema.parse({ profile }) }) as unknown as PrinterWithLive;

function client(settings: AppSettings, role = 'admin') {
    const qc = testQueryClient();
    qc.setQueryData(['settings'], settings);
    qc.setQueryData(['session'], { user: { id: 'u', email: 'a@b.c', role } });
    return qc;
}

beforeEach(() => {
    localStorage.clear();
    holder.printers = [];
});

describe('startItems', () => {
    it('starts with nothing done', () => {
        expect(startItems([], blank).map((i) => [i.key, i.done])).toEqual([
            ['printer', false],
            ['profile', false],
            ['publicUrl', false],
            ['spoolman', false],
            ['notifications', false],
        ]);
    });

    it('checks each item off from the printers and the settings', () => {
        const settings = appSettingsSchema.parse({
            publicUrl: 'http://kobralink.local:7100',
            spoolmanUrl: 'http://spoolman.local:7912',
            notifications: { ntfyUrl: 'https://ntfy.sh/kobralink' },
        });
        expect(startItems([printer({ location: 'Garage' })], settings).every((i) => i.done)).toBe(true);
        expect(startItems([printer({ powerW: 150 })], blank).find((i) => i.key === 'profile')?.done).toBe(true);
        expect(startItems([printer({ tags: ['petg'] })], blank).find((i) => i.key === 'profile')?.done).toBe(true);
        expect(startItems([printer()], blank).find((i) => i.key === 'profile')?.done).toBe(false);
    });

    it('sends the profile item to the printer settings once a printer exists', () => {
        expect(startItems([], blank).find((i) => i.key === 'profile')?.link).toEqual({ to: '/setup' });
        expect(startItems([printer()], blank).find((i) => i.key === 'profile')?.link).toEqual({
            to: '/printers/$printerId/settings',
            params: { printerId: 'p1' },
        });
    });
});

describe('GettingStarted', () => {
    it('lists the steps with the progress', async () => {
        holder.printers = [printer()];
        await renderWithProviders(<GettingStarted />, { queryClient: client(blank) });
        expect(screen.getByText(m.start_title())).toBeTruthy();
        expect(screen.getByText(m.start_progress({ done: 1, total: 5 }))).toBeTruthy();
        expect(screen.getByRole('link', { name: m.start_spoolman() }).getAttribute('href')).toBe(
            '/settings/integrations',
        );
    });

    it('can be hidden for good in this browser', async () => {
        await renderWithProviders(<GettingStarted />, { queryClient: client(blank) });
        await userEvent.click(screen.getByRole('button', { name: m.start_dismiss() }));
        expect(screen.queryByText(m.start_title())).toBeNull();
        expect(localStorage.getItem(START_DISMISSED_KEY)).toBe('1');
    });

    it('stays hidden once dismissed, when everything is done, or for viewers', async () => {
        localStorage.setItem(START_DISMISSED_KEY, '1');
        const first = await renderWithProviders(<GettingStarted />, { queryClient: client(blank) });
        expect(screen.queryByText(m.start_title())).toBeNull();
        first.unmount();
        localStorage.clear();
        const viewer = await renderWithProviders(<GettingStarted />, { queryClient: client(blank, 'viewer') });
        expect(screen.queryByText(m.start_title())).toBeNull();
        viewer.unmount();
        holder.printers = [printer({ location: 'x' })];
        const done = appSettingsSchema.parse({
            publicUrl: 'http://a.b',
            spoolmanUrl: 'http://c.d',
            notifications: { discordUrl: 'https://discord.test/x' },
        });
        await renderWithProviders(<GettingStarted />, { queryClient: client(done) });
        expect(screen.queryByText(m.start_title())).toBeNull();
    });
});
