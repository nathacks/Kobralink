import { type AppSettings, appSettingsSchema } from '@kobralink/shared';
import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilamentPage } from '@/components/filament/filament-page';
import { m } from '@/lib/i18n';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { GeneralSettingsPage } from './general-settings-page';
import { OperatorOnly } from './settings-form-card';
import { LEGACY_SETTINGS_TABS, legacySettingsPath, SETTINGS_SECTIONS, visibleSections } from './settings-sections';

const holder = vi.hoisted(() => ({ qc: null as QueryClient | null, save: vi.fn() }));

vi.mock('@/hooks/use-save-settings', () => ({
    useSaveSettings: () => ({ mutateAsync: holder.save, isPending: false }),
}));

vi.mock('@/lib/api', () => {
    const group = () => new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) });
    return { api: new Proxy({}, { get: () => group() }) };
});

vi.mock('@/components/settings/spools-card', () => ({ SpoolsCard: () => <div>spools card</div> }));
vi.mock('@/components/printer/filament-profiles-card', () => ({
    FilamentProfilesCard: () => <div>profiles card</div>,
}));

const stored: AppSettings = appSettingsSchema.parse({
    locale: 'en',
    currency: 'BRL',
    costs: { energyPricePerKwh: 0.3, printerPowerW: 150 },
    aceDryPresets: [{ name: 'PETG', targetTemp: 55, duration: 300 }],
});

function client(settings: AppSettings, role: 'admin' | 'operator' | 'viewer' = 'admin') {
    const qc = testQueryClient();
    qc.setQueryData(['settings'], settings);
    qc.setQueryData(['session'], { user: { id: 'u1', email: 'a@b.c', name: 'A', role } });
    holder.qc = qc;
    return qc;
}

beforeEach(() => {
    holder.save.mockReset().mockImplementation(async (patch: Partial<AppSettings>) => {
        const next = { ...(holder.qc?.getQueryData<AppSettings>(['settings']) ?? stored), ...patch };
        holder.qc?.setQueryData(['settings'], next);
        return next;
    });
});

describe('settings sections', () => {
    it('hides the users section from non-admins', () => {
        expect(visibleSections(true)).toHaveLength(SETTINGS_SECTIONS.length);
        expect(visibleSections(false).map((s) => s.to)).not.toContain('/settings/users');
    });

    it('keeps the OrcaSlicer page and the logs inside the settings', () => {
        const paths = SETTINGS_SECTIONS.map((s) => s.to);
        expect(paths).toContain('/settings/slicer');
        expect(paths).toContain('/settings/logs');
    });

    it('redirects the old tab links', () => {
        expect(legacySettingsPath(undefined)).toBe('/settings/general');
        expect(legacySettingsPath('macros')).toBe('/settings/macros');
        expect(legacySettingsPath('filament')).toBe('/filament');
        for (const path of Object.values(LEGACY_SETTINGS_TABS)) {
            if (path !== '/filament') expect(SETTINGS_SECTIONS.map((s) => s.to)).toContain(path);
        }
    });
});

describe('OperatorOnly', () => {
    it('disables the forms and explains why for viewers', async () => {
        await renderWithProviders(
            <OperatorOnly>
                <button type="button">edit</button>
            </OperatorOnly>,
            { queryClient: client(stored, 'viewer') },
        );
        expect(screen.getByText(m.role_viewer_hint())).toBeTruthy();
        expect(screen.getByRole('button', { name: 'edit' }).closest('fieldset')?.disabled).toBe(true);
    });

    it('leaves the forms enabled for operators', async () => {
        await renderWithProviders(
            <OperatorOnly>
                <button type="button">edit</button>
            </OperatorOnly>,
            { queryClient: client(stored, 'operator') },
        );
        expect(screen.queryByText(m.role_viewer_hint())).toBeNull();
        expect(screen.getByRole('button', { name: 'edit' }).closest('fieldset')?.disabled).toBe(false);
    });
});

describe('GeneralSettingsPage', () => {
    it('shows the appearance, general and cost cards', async () => {
        await renderWithProviders(<GeneralSettingsPage />, { queryClient: client(stored) });
        expect(screen.getByText(m.theme_title())).toBeTruthy();
        expect(screen.getByText(m.settings_general())).toBeTruthy();
        expect(screen.getByText(m.settings_costs())).toBeTruthy();
    });

    it('keeps unsaved edits in one card when another card is saved', async () => {
        await renderWithProviders(<GeneralSettingsPage />, { queryClient: client(stored) });
        const energy = screen.getByLabelText(m.settings_energy_price()) as HTMLInputElement;
        await userEvent.clear(energy);
        await userEvent.type(energy, '0.75');
        const general = screen.getByText(m.settings_general()).closest('form');
        if (!general) throw new Error('general card is not a form');
        const currency = within(general).getByDisplayValue('BRL');
        await userEvent.clear(currency);
        await userEvent.type(currency, 'usd');
        await userEvent.click(within(general).getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(holder.save).toHaveBeenCalledOnce());
        expect(holder.save.mock.calls[0][0]).toMatchObject({ currency: 'USD' });
        expect((screen.getByLabelText(m.settings_energy_price()) as HTMLInputElement).value).toBe('0.75');
        const saved = screen.getByText(m.settings_general()).closest('form');
        if (!saved) throw new Error('general card is not a form');
        expect(within(saved).getByDisplayValue('USD')).toBeTruthy();
        expect(within(saved).queryByText(m.form_unsaved())).toBeNull();
    });

    it('shows a save bar once a card changes, and discards the changes', async () => {
        await renderWithProviders(<GeneralSettingsPage />, { queryClient: client(stored) });
        expect(screen.queryByText(m.form_unsaved())).toBeNull();
        const energy = screen.getByLabelText(m.settings_energy_price()) as HTMLInputElement;
        const before = energy.value;
        await userEvent.clear(energy);
        await userEvent.type(energy, '0.75');
        const bar = await screen.findByRole('status');
        expect(within(bar).getByText(m.form_unsaved())).toBeTruthy();
        expect(screen.getAllByText(m.form_unsaved())).toHaveLength(1);
        await userEvent.click(within(bar).getByRole('button', { name: m.form_discard() }));
        expect((screen.getByLabelText(m.settings_energy_price()) as HTMLInputElement).value).toBe(before);
        expect(screen.queryByText(m.form_unsaved())).toBeNull();
        expect(holder.save).not.toHaveBeenCalled();
    });
});

describe('FilamentPage', () => {
    it('recommends Spoolman when it is not configured', async () => {
        await renderWithProviders(<FilamentPage />, { queryClient: client(stored) });
        expect(screen.getByText(m.filament_spoolman_recommended())).toBeTruthy();
        expect(screen.getByRole('link', { name: m.filament_spoolman_action() }).getAttribute('href')).toBe(
            '/settings/integrations',
        );
        expect(screen.getByText('spools card')).toBeTruthy();
        expect(screen.getByText('profiles card')).toBeTruthy();
        expect(screen.getByText(m.dry_presets_title())).toBeTruthy();
    });

    it('does not nag once Spoolman is set up', async () => {
        await renderWithProviders(<FilamentPage />, {
            queryClient: client({ ...stored, spoolmanUrl: 'http://spoolman.test:7912' }),
        });
        expect(screen.queryByText(m.filament_spoolman_recommended())).toBeNull();
    });
});
