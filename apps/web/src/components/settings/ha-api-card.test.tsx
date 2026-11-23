import { appSettingsSchema } from '@kobralink/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { HaApiCard } from './ha-api-card';

const { save, homeAssistant, toast } = vi.hoisted(() => ({
    save: vi.fn(),
    homeAssistant: { test: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/use-save-settings', () => ({ useSaveSettings: () => ({ mutateAsync: save, isPending: false }) }));
vi.mock('@/lib/api', () => ({ api: { homeAssistant } }));

beforeEach(() => {
    save.mockReset().mockResolvedValue({});
    homeAssistant.test.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
});

describe('HaApiCard', () => {
    it('saves the address and the token', async () => {
        await renderWithProviders(<HaApiCard settings={appSettingsSchema.parse({})} />);
        expect(screen.getByRole('button', { name: new RegExp(m.ha_api_test()) }).hasAttribute('disabled')).toBe(true);
        await userEvent.type(screen.getByLabelText(m.ha_api_url()), 'http://192.168.1.54:8123');
        await userEvent.type(screen.getByLabelText(m.ha_api_token()), 'secret');
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() =>
            expect(save).toHaveBeenCalledWith({ homeAssistant: { url: 'http://192.168.1.54:8123', token: 'secret' } }),
        );
    });

    it('tests the connection and shows the outcome', async () => {
        const settings = appSettingsSchema.parse({ homeAssistant: { url: 'http://ha.local:8123', token: 't' } });
        await renderWithProviders(<HaApiCard settings={settings} />);
        homeAssistant.test.mockResolvedValueOnce({ ok: true, message: '' });
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.ha_api_test()) }));
        expect(homeAssistant.test).toHaveBeenCalledWith({ url: 'http://ha.local:8123', token: 't' });
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith(m.ha_api_test_ok()));
        homeAssistant.test.mockResolvedValueOnce({ ok: false, message: 'refused' });
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.ha_api_test()) }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('refused'));
    });

    it('refuses an address that is not a URL', async () => {
        await renderWithProviders(<HaApiCard settings={appSettingsSchema.parse({})} />);
        await userEvent.type(screen.getByLabelText(m.ha_api_url()), 'ha');
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await new Promise((r) => setTimeout(r, 20));
        expect(save).not.toHaveBeenCalled();
    });
});
