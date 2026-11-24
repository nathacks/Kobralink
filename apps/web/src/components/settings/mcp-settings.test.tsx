import { type AppSettings, appSettingsSchema } from '@kobralink/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { oauthSearch } from '@/lib/oauth-request';
import { findSetting } from '@/lib/reveal-setting';
import { ConsentCard } from '@/routes/oauth/consent';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { McpAppsCard } from './mcp-apps-card';
import { McpCard } from './mcp-card';
import { McpKeysCard } from './mcp-keys-card';
import { McpToolsCard } from './mcp-tools-card';
import { settingHits } from './settings-index';

const auth = vi.hoisted(() => ({
    create: vi.fn(),
    list: vi.fn(),
    fetch: vi.fn(),
    save: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
    authClient: { apiKey: { create: auth.create, list: auth.list, delete: vi.fn() }, $fetch: auth.fetch },
}));
vi.mock('@/hooks/use-save-settings', () => ({ useSaveSettings: () => ({ mutate: auth.save, isPending: false }) }));
vi.mock('@/lib/api', () => {
    const group = () => new Proxy({}, { get: () => vi.fn().mockRejectedValue(new Error('offline')) });
    return { api: new Proxy({}, { get: () => group() }) };
});

const stored: AppSettings = appSettingsSchema.parse({ locale: 'en' });

function client(role: 'admin' | 'operator' = 'admin', url = 'https://kobra.example/api/mcp') {
    const qc = testQueryClient();
    qc.setQueryData(['settings'], stored);
    qc.setQueryData(['session'], { user: { id: 'u1', email: 'a@b.c', name: 'A', role } });
    qc.setQueryData(['mcp'], { enabled: false, url, oauth: true });
    qc.setQueryData(
        ['mcp', 'connections'],
        [{ id: 'c1', name: 'Claude', redirectHosts: ['claude.ai'], access: 'read', createdAt: '2026-11-24T10:00:00Z' }],
    );
    qc.setQueryData(
        ['mcp', 'tools'],
        [
            {
                name: 'list_printers',
                access: 'read',
                destructive: false,
                lock: null,
                bedClear: false,
                defaultMode: 'allow',
            },
            {
                name: 'start_print',
                access: 'control',
                destructive: true,
                lock: 'always',
                bedClear: true,
                defaultMode: 'ask',
            },
        ],
    );
    return qc;
}

beforeEach(() => {
    for (const fn of Object.values(auth)) fn.mockReset();
    auth.list.mockResolvedValue({ data: { apiKeys: [] } });
    auth.create.mockResolvedValue({ data: { key: 'kl_mcp_secret' } });
});

describe('MCP settings', () => {
    it('lets only an admin enable the server', async () => {
        const { unmount } = await renderWithProviders(<McpCard />, { queryClient: client() });
        await userEvent.click(screen.getByRole('switch', { name: m.mcp_enable() }));
        expect(auth.save).toHaveBeenCalledWith({ mcpEnabled: true });
        expect(screen.getByText('https://kobra.example/api/mcp')).toBeTruthy();
        expect(screen.getByText(m.mcp_oauth_on())).toBeTruthy();
        unmount();
        await renderWithProviders(<McpCard />, { queryClient: client('operator', 'http://localhost:7100/api/mcp') });
        expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(m.mcp_oauth_local())).toBeTruthy();
    });

    it('creates a read key by default and shows the command once', async () => {
        await renderWithProviders(<McpKeysCard />, { queryClient: client() });
        await userEvent.type(screen.getByLabelText(m.api_keys_name()), 'Laptop');
        await userEvent.click(screen.getByRole('button', { name: m.api_keys_create() }));
        expect(auth.create).toHaveBeenCalledWith({ name: 'Laptop', configId: 'mcp', metadata: { access: 'read' } });
        expect(await screen.findByText(/claude mcp add .*Bearer kl_mcp_secret/)).toBeTruthy();
    });

    it('is reachable from the settings search', async () => {
        await renderWithProviders(
            <>
                <McpCard />
                <McpKeysCard />
                <McpAppsCard />
                <McpToolsCard />
            </>,
            { queryClient: client() },
        );
        const hits = settingHits(stored, [], true).filter((h) => h.to === '/settings/mcp' && h.card !== undefined);
        expect(hits.length).toBeGreaterThan(5);
        expect(hits.filter((h) => !findSetting(h.card ?? '', h.label)?.exact)).toEqual([]);
        expect(screen.getByText(/claude\.ai ·/)).toBeTruthy();
    });
});

describe('MCP tool permissions', () => {
    const pressed = (tool: string) =>
        within(screen.getByRole('group', { name: tool })).getByRole('button', { pressed: true }).textContent;

    it('lists the tools with their rules and switches between allow, ask and deny', async () => {
        const qc = client();
        qc.setQueryData(['settings'], { ...stored, mcpTools: { list_printers: 'deny' } });
        await renderWithProviders(<McpToolsCard />, { queryClient: qc });
        expect(pressed(m.mcp_tool_list_printers())).toBe(m.mcp_mode_deny());
        expect(pressed(m.mcp_tool_start_print())).toBe(m.mcp_mode_ask());
        expect(screen.getByText(m.mcp_rule_bed())).toBeTruthy();
        expect(screen.getByText(m.mcp_rule_lock_always())).toBeTruthy();
        const row = within(screen.getByRole('group', { name: m.mcp_tool_start_print() }));
        await userEvent.click(row.getByRole('button', { name: m.mcp_mode_allow() }));
        expect(auth.save).toHaveBeenCalledWith({ mcpTools: { start_print: 'allow' } });
    });

    it('is read only for an operator', async () => {
        await renderWithProviders(<McpToolsCard />, { queryClient: client('operator') });
        const group = screen.getByRole('group', { name: m.mcp_tool_start_print() }) as HTMLFieldSetElement;
        expect(group.disabled).toBe(true);
    });
});

describe('OAuth consent', () => {
    const query = new URLSearchParams({
        client_id: 'c1',
        redirect_uri: 'https://claude.ai/callback',
        scope: 'mcp:read mcp:control offline_access',
        sig: 'x',
    }).toString();

    it('shows who asks and where the answer goes, and grants only what the user picks', async () => {
        auth.fetch.mockImplementation(async (path: string) =>
            path === '/oauth2/public-client' ? { data: { client_name: 'Claude' } } : { data: { url: '#done' } },
        );
        await renderWithProviders(<ConsentCard oauth={query} email="a@b.c" />, { queryClient: client() });
        expect(await screen.findByText(m.oauth_request({ name: 'Claude', email: 'a@b.c' }))).toBeTruthy();
        expect(screen.getByText(m.oauth_redirect({ host: 'claude.ai' }))).toBeTruthy();
        await userEvent.click(screen.getByRole('radio', { name: new RegExp(m.mcp_access_read()) }));
        await userEvent.click(screen.getByRole('button', { name: m.oauth_allow() }));
        await waitFor(() =>
            expect(auth.fetch).toHaveBeenLastCalledWith('/oauth2/consent', {
                method: 'POST',
                body: { accept: true, scope: 'mcp:read offline_access', oauth_query: query },
            }),
        );
    });

    it('refuses to continue when the app is unknown', async () => {
        auth.fetch.mockResolvedValue({ error: { message: 'not found' } });
        await renderWithProviders(<ConsentCard oauth={query} email="a@b.c" />, { queryClient: client() });
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.queryByRole('button', { name: m.oauth_allow() })).toBeNull();
    });

    it('keeps the signed request byte for byte', () => {
        expect(oauthSearch({})).toEqual({});
        expect(oauthSearch({ oauth: 'a=1&ba_param=a&ba_param=b' })).toEqual({ oauth: 'a=1&ba_param=a&ba_param=b' });
        window.history.replaceState(null, '', '/login?exp=1&ba_param=a&ba_param=b&sig=x');
        expect(oauthSearch({ sig: 'x' })).toEqual({ oauth: 'exp=1&ba_param=a&ba_param=b&sig=x' });
        window.history.replaceState(null, '', '/');
    });
});
