import { appSettingsSchema } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { findSetting } from '@/lib/reveal-setting';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { ApiKeysCard, MoonrakerKeyCard, prometheusScrape } from './api-keys-card';
import { settingHits } from './settings-index';

const auth = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), save: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
    authClient: { apiKey: { create: auth.create, list: auth.list, delete: vi.fn() } },
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
    qc.setQueryData(['mcp'], { enabled: true, url: 'https://kobra.example/api/mcp', oauth: true });
    return qc;
}

beforeEach(() => {
    for (const fn of Object.values(auth)) fn.mockReset();
    auth.list.mockResolvedValue({ data: { apiKeys: [] } });
    auth.create.mockResolvedValue({ data: { key: 'kl_secret' } });
});

describe('MoonrakerKeyCard', () => {
    const toggle = () => screen.getByRole('switch', { name: m.slicer_keys_require() });

    it('lets an admin require a key and links to the key page', async () => {
        await renderWithProviders(<MoonrakerKeyCard />, { queryClient: client('admin') });
        await userEvent.click(toggle());
        expect(auth.save).toHaveBeenCalledWith({ moonrakerApiKey: true });
        expect(screen.getByRole('link', { name: m.api_keys_manage() }).getAttribute('href')).toBe('/settings/api-keys');
    });

    it('is read-only for viewers', async () => {
        await renderWithProviders(<MoonrakerKeyCard />, { queryClient: client('viewer') });
        expect(toggle().hasAttribute('disabled')).toBe(true);
    });
});

describe('ApiKeysCard', () => {
    it('needs a name and a use, then creates a key for the ticked uses only', async () => {
        await renderWithProviders(<ApiKeysCard />, { queryClient: client('admin') });
        const submit = screen.getByRole('button', { name: m.api_keys_create() }) as HTMLButtonElement;
        await userEvent.type(screen.getByLabelText(m.api_keys_name()), 'Grafana');
        expect(submit.disabled).toBe(true);
        await userEvent.click(screen.getByRole('switch', { name: m.api_keys_use_metrics() }));
        await userEvent.click(submit);
        expect(auth.create).toHaveBeenCalledWith({
            name: 'Grafana',
            metadata: { printerId: null, uses: ['metrics'] },
        });
        expect(await screen.findByText(/credentials: kl_secret/)).toBeTruthy();
    });

    it('lists every key with its uses and printers', async () => {
        auth.list.mockResolvedValue({
            data: {
                apiKeys: [
                    {
                        id: 'k1',
                        name: 'Claude',
                        start: 'kl_ab',
                        createdAt: '2026-11-25T10:00:00Z',
                        lastRequest: null,
                        metadata: { printerId: null, uses: ['mcp_control', 'metrics'] },
                    },
                ],
            },
        });
        await renderWithProviders(<ApiKeysCard />, { queryClient: client('admin') });
        expect(
            await screen.findByText(`MCP · ${m.mcp_access_control()} · Prometheus · ${m.api_keys_scope_all()}`),
        ).toBeTruthy();
    });
});

describe('settings search', () => {
    it('finds every API key setting on its page', async () => {
        await renderWithProviders(<ApiKeysCard />, { queryClient: client('admin') });
        const stored = appSettingsSchema.parse({ locale: 'en' });
        const hits = settingHits(stored, [], true).filter((h) => h.to === '/settings/api-keys');
        expect(hits.length).toBeGreaterThan(5);
        expect(hits.filter((h) => !findSetting(h.card ?? h.label, h.label)?.exact)).toEqual([]);
    });
});

describe('prometheusScrape', () => {
    it('targets the API host with the key as bearer credentials', () => {
        expect(prometheusScrape('http://192.168.1.5:7100/api/v1/metrics', 'kl_x')).toBe(
            [
                '- job_name: kobralink',
                '  scheme: http',
                '  metrics_path: /api/v1/metrics',
                '  authorization:',
                '    credentials: kl_x',
                '  static_configs:',
                "    - targets: ['192.168.1.5:7100']",
            ].join('\n'),
        );
    });
});
