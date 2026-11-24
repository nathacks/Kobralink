import { appSettingsSchema } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { ApiKeysCard } from './api-keys-card';

const auth = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
    authClient: { apiKey: { create: vi.fn(), list: auth.list, delete: vi.fn() } },
}));
vi.mock('@/hooks/use-save-settings', () => ({ useSaveSettings: () => ({ mutate: auth.save, isPending: false }) }));
vi.mock('@/lib/api', () => {
    const group = () => new Proxy({}, { get: () => vi.fn().mockRejectedValue(new Error('offline')) });
    return { api: new Proxy({}, { get: () => group() }) };
});

function client(role: 'admin' | 'viewer') {
    const qc = testQueryClient();
    qc.setQueryData(['settings'], appSettingsSchema.parse({ locale: 'en' }));
    qc.setQueryData(['session'], { user: { id: 'u1', email: 'a@b.c', name: 'A', role } });
    qc.setQueryData(['printers'], []);
    return qc;
}

const toggle = () => screen.getByRole('switch', { name: m.slicer_keys_require() });

beforeEach(() => {
    auth.save.mockReset();
    auth.list.mockReset().mockResolvedValue({ data: { apiKeys: [] } });
});

describe('ApiKeysCard', () => {
    it('requires a key and generates the Moonraker keys in the same card', async () => {
        await renderWithProviders(<ApiKeysCard />, { queryClient: client('admin') });
        await userEvent.click(toggle());
        expect(auth.save).toHaveBeenCalledWith({ moonrakerApiKey: true });
        expect(screen.getByRole('button', { name: m.api_keys_create() })).toBeTruthy();
        expect(auth.list).toHaveBeenCalledWith({ query: { configId: 'default' } });
    });

    it('is read-only for viewers', async () => {
        await renderWithProviders(<ApiKeysCard />, { queryClient: client('viewer') });
        expect(toggle().hasAttribute('disabled')).toBe(true);
        expect(screen.queryByRole('button', { name: m.api_keys_create() })).toBeNull();
    });
});
