import { appSettingsSchema, printerSettingsSchema } from '@kobralink/shared';
import type { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { initialProfile, SetupWizard, setupSteps } from './setup-wizard';

const mocks = vi.hoisted(() => ({
    signUp: vi.fn(),
    getSession: vi.fn(),
    settingsUpdate: vi.fn(),
    printersAdd: vi.fn(),
    printersList: vi.fn(),
    printersUpdate: vi.fn(),
    spoolmanHealth: vi.fn(),
    setupStatus: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
    authClient: { signUp: { email: mocks.signUp }, getSession: mocks.getSession },
}));

vi.mock('@/lib/api', () => {
    const known: Record<string, unknown> = {
        setupStatus: mocks.setupStatus,
        settings: { update: mocks.settingsUpdate },
        printers: { add: mocks.printersAdd, list: mocks.printersList, update: mocks.printersUpdate },
        spoolman: { health: mocks.spoolmanHealth },
    };
    const group = (fns: Record<string, unknown> = {}) =>
        new Proxy(fns, { get: (t, k: string) => (k in t ? t[k] : vi.fn().mockResolvedValue([])) });
    return {
        api: new Proxy(known, {
            get: (t, k: string) => (typeof t[k] === 'function' ? t[k] : group(t[k] as Record<string, unknown>)),
        }),
    };
});

vi.mock('@/hooks/use-hosts', () => ({ useHosts: () => ['192.168.1.10'] }));

const settings = appSettingsSchema.parse({ currency: 'EUR' });
const kobra = {
    id: 'p1',
    name: 'Kobra 4',
    model: 'Anycubic Kobra 4',
    modeId: '20028',
    httpPort: 7125,
    settings: printerSettingsSchema.parse({}),
    live: null,
} as unknown as PrinterWithLive;

let printers: PrinterWithLive[] = [];

function client(signedIn: boolean): QueryClient {
    const qc = testQueryClient();
    qc.setQueryData(['settings'], settings);
    if (signedIn) qc.setQueryData(['session'], { user: { id: 'u', email: 'a@b.c', role: 'admin' } });
    return qc;
}

beforeEach(() => {
    printers = [];
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.printersList.mockImplementation(async () => printers);
    mocks.settingsUpdate.mockImplementation(async (patch) => ({ ...settings, ...patch }));
    mocks.getSession.mockResolvedValue({ data: { user: { id: 'u', email: 'a@b.c', role: 'admin' } } });
    mocks.signUp.mockResolvedValue({ error: null });
    mocks.setupStatus.mockResolvedValue({ needsSetup: false });
});

describe('setupSteps', () => {
    it('asks for an account only on a fresh install', () => {
        expect(setupSteps(true)[0]).toBe('account');
        expect(setupSteps(false)).toEqual(['prefs', 'printer', 'profile', 'spoolman', 'slicer']);
    });
});

describe('initialProfile', () => {
    it('suggests the official default nozzle when none is set', () => {
        expect(initialProfile(kobra).nozzleMm).toBe(0.4);
        const set = { ...kobra, settings: printerSettingsSchema.parse({ profile: { nozzleMm: 0.6 } }) };
        expect(initialProfile(set).nozzleMm).toBe(0.6);
        const unknown = { ...kobra, modeId: '99999' };
        expect(initialProfile(unknown).nozzleMm).toBeNull();
    });
});

describe('SetupWizard', () => {
    it('creates the admin account first on a fresh install', async () => {
        await renderWithProviders(<SetupWizard needsAccount />, { queryClient: client(false) });
        expect(screen.getByText(m.setup_step({ n: 1, total: 4 }))).toBeTruthy();
        await userEvent.type(screen.getByLabelText(m.login_name()), 'Ricardo');
        await userEvent.type(screen.getByLabelText(m.login_email()), 'admin@kobralink.test');
        await userEvent.type(screen.getByLabelText(m.login_password()), 'a-long-password');
        await userEvent.click(screen.getByRole('button', { name: m.login_create_account() }));
        await waitFor(() =>
            expect(mocks.signUp).toHaveBeenCalledWith({
                email: 'admin@kobralink.test',
                password: 'a-long-password',
                name: 'Ricardo',
            }),
        );
        expect(await screen.findByText(m.setup_prefs_title())).toBeTruthy();
    });

    it('saves the currency, the address and the language', async () => {
        await renderWithProviders(<SetupWizard needsAccount={false} />, { queryClient: client(true) });
        const currency = screen.getByLabelText(m.settings_currency());
        await userEvent.clear(currency);
        await userEvent.type(currency, 'brl');
        const url = screen.getByLabelText(m.settings_public_url()) as HTMLInputElement;
        expect(url.value).toBe(window.location.origin);
        fireEvent.change(url, { target: { value: 'http://kobralink.local:7100' } });
        await userEvent.click(screen.getByRole('button', { name: m.setup_next() }));
        await waitFor(() =>
            expect(mocks.settingsUpdate).toHaveBeenCalledWith({
                currency: 'BRL',
                publicUrl: 'http://kobralink.local:7100',
                locale: 'en',
            }),
        );
        expect(await screen.findByText(m.setup_printer_title())).toBeTruthy();
    });

    it('adds the printer, shows its specifications and saves its profile', async () => {
        mocks.printersAdd.mockImplementation(async () => {
            printers = [kobra];
            return kobra;
        });
        mocks.printersUpdate.mockResolvedValue(kobra);
        await renderWithProviders(<SetupWizard needsAccount={false} />, { queryClient: client(true) });
        await userEvent.click(screen.getByRole('button', { name: m.setup_next() }));
        await userEvent.type(await screen.findByLabelText(m.field_ip()), '192.168.1.50');
        await userEvent.click(screen.getByRole('button', { name: m.add_printer_submit() }));
        expect(await screen.findByText(m.setup_printer_found({ model: 'Anycubic Kobra 4' }))).toBeTruthy();
        expect(mocks.printersAdd).toHaveBeenCalledWith({ ip: '192.168.1.50', name: undefined });
        expect(screen.getByText(m.specs_hint({ model: 'Kobra 4' }))).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.setup_next() }));
        await userEvent.type(await screen.findByLabelText(m.profile_location()), 'Garage');
        await userEvent.click(screen.getByRole('button', { name: m.setup_next() }));
        await waitFor(() =>
            expect(mocks.printersUpdate).toHaveBeenCalledWith('p1', {
                settings: { profile: expect.objectContaining({ location: 'Garage', nozzleMm: 0.4 }) },
            }),
        );
        expect(await screen.findByText(m.setup_spoolman_title())).toBeTruthy();
    });

    it('skips the printer and the steps that need one', async () => {
        await renderWithProviders(<SetupWizard needsAccount={false} />, { queryClient: client(true) });
        expect(screen.getByText(m.setup_step({ n: 1, total: 3 }))).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.setup_next() }));
        await userEvent.click(await screen.findByRole('button', { name: m.setup_skip() }));
        expect(await screen.findByText(m.setup_spoolman_title())).toBeTruthy();
        expect(mocks.printersAdd).not.toHaveBeenCalled();
    });

    it('only continues past Spoolman once it answers, or when skipped', async () => {
        mocks.spoolmanHealth.mockResolvedValueOnce({ reachable: false, configured: true });
        mocks.spoolmanHealth.mockResolvedValueOnce({ reachable: true, configured: true });
        await renderWithProviders(<SetupWizard needsAccount={false} />, { queryClient: client(true) });
        await userEvent.click(screen.getByRole('button', { name: m.setup_next() }));
        await userEvent.click(await screen.findByRole('button', { name: m.setup_skip() }));
        const input = await screen.findByLabelText(m.spoolman_server_url());
        await userEvent.type(input, 'http://spoolman.local:7912');
        await userEvent.click(screen.getByRole('button', { name: m.setup_spoolman_test() }));
        expect(await screen.findByText(m.setup_spoolman_fail())).toBeTruthy();
        expect((screen.getByRole('button', { name: m.setup_next() }) as HTMLButtonElement).disabled).toBe(true);
        await userEvent.click(screen.getByRole('button', { name: m.setup_spoolman_test() }));
        expect(await screen.findByText(m.setup_spoolman_ok())).toBeTruthy();
        expect(mocks.settingsUpdate).toHaveBeenLastCalledWith({ spoolmanUrl: 'http://spoolman.local:7912' });
        expect((screen.getByRole('button', { name: m.setup_next() }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('ends on the OrcaSlicer address of each printer', async () => {
        printers = [kobra];
        mocks.printersUpdate.mockResolvedValue(kobra);
        const { router } = await renderWithProviders(<SetupWizard needsAccount={false} />, {
            queryClient: client(true),
        });
        await userEvent.click(screen.getByRole('button', { name: m.setup_next() }));
        await userEvent.click(await screen.findByRole('button', { name: m.setup_next() }));
        await userEvent.click(await screen.findByRole('button', { name: m.setup_skip() }));
        await userEvent.click(await screen.findByRole('button', { name: m.setup_skip() }));
        expect(await screen.findByText('http://192.168.1.10:7125')).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.setup_finish() }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/printers'));
    });
});
