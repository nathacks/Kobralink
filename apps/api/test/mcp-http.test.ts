import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { type ApiKeyUse, MCP_PATH, MCP_TOOL_NAMES } from '@kobralink/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { internalSignup, type KobralinkAuth } from '../src/auth/auth';
import { loadEnv } from '../src/config/env';
import { MoonrakerAuthService } from '../src/moonraker/moonraker-auth.service';
import { getPrisma, initPrisma } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';

const ORIGIN = loadEnv().baseUrl;
const RESOURCE = `${ORIGIN}${MCP_PATH}`;
const PASSWORD = 'correct horse battery';
const REDIRECT = 'https://client.example/callback';

let app: NestExpressApplication;
let base = '';
let auth: KobralinkAuth;
let settings: SettingsService;

const cookies: Record<string, string> = {};

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`${base}${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
        body: JSON.stringify(body),
    });
}

async function rpc(token: string | null, method: string, params: unknown = {}) {
    const res = await post(
        MCP_PATH,
        { jsonrpc: '2.0', id: 1, method, params },
        {
            accept: 'application/json, text/event-stream',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
    );
    const text = await res.text();
    const data = text.startsWith('{') ? text : (/^data: (.*)$/m.exec(text)?.[1] ?? '{}');
    return { status: res.status, headers: res.headers, body: JSON.parse(data) };
}

async function user(name: string, role: string) {
    const email = `${name}@example.com`;
    await internalSignup.run(true, () => auth.api.signUpEmail({ body: { name, email, password: PASSWORD } }));
    await getPrisma().user.update({ where: { email }, data: { role } });
    const res = await post('/api/auth/sign-in/email', { email, password: PASSWORD });
    cookies[name] = res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
}

function createKey(name: string, metadata: unknown): Promise<Response> {
    return post('/api/auth/api-key/create', { name: 'k', metadata }, { cookie: cookies[name] });
}

async function key(name: string, uses: ApiKeyUse[], printerId: string | null = null): Promise<string> {
    const res = await createKey(name, { printerId, uses });
    return ((await res.json()) as { key: string }).key;
}

beforeAll(async () => {
    await initPrisma();
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../src/app.module');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: false });
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    auth = app.get<AuthService<KobralinkAuth>>(AuthService).instance;
    settings = app.get(SettingsService);
    await user('admin', 'admin');
    await user('operator', 'operator');
    await user('viewer', 'viewer');
    await settings.update({ mcpEnabled: true, mcpTools: { remove_from_queue: 'allow' } });
});

afterAll(async () => {
    await app?.close();
});

describe('MCP access with API keys', () => {
    it('refuses missing, unknown and Moonraker keys, and advertises OAuth', async () => {
        const none = await rpc(null, 'tools/list');
        expect(none.status).toBe(401);
        expect(none.headers.get('www-authenticate')).toContain('oauth-protected-resource');
        expect((await rpc('kl_mcp_nope', 'tools/list')).status).toBe(401);
        expect((await rpc(await key('admin', ['moonraker', 'metrics']), 'tools/list')).status).toBe(401);
    });

    it('lists every tool with a valid schema, and only reading tools to a read key', async () => {
        const full = await rpc(await key('operator', ['mcp_control']), 'tools/list');
        const tools = full.body.result.tools as { name: string; inputSchema: { type: string }; annotations: object }[];
        expect(tools).toHaveLength(56);
        expect(new Set(tools.map((t) => t.name)).size).toBe(56);
        expect(tools.every((t) => t.inputSchema.type === 'object')).toBe(true);
        const read = await rpc(await key('operator', ['mcp_read']), 'tools/list');
        expect(read.body.result.tools).toHaveLength(20);
    });

    it('follows the current role of the owner and the revocation of the key', async () => {
        const token = await key('operator', ['mcp_control']);
        const call = { name: 'remove_from_queue', arguments: { itemId: 'none' } };
        expect((await rpc(token, 'tools/call', call)).body.result.isError).toBeUndefined();
        await getPrisma().user.update({ where: { email: 'operator@example.com' }, data: { role: 'viewer' } });
        expect((await rpc(token, 'tools/list')).body.result.tools).toHaveLength(20);
        const refused = await rpc(token, 'tools/call', call);
        expect(refused.body.error ?? refused.body.result.isError).toBeTruthy();
        await getPrisma().user.update({ where: { email: 'operator@example.com' }, data: { role: 'operator' } });
        await getPrisma().apikey.updateMany({ data: { enabled: false } });
        expect((await rpc(token, 'tools/list')).status).toBe(401);
    });

    it('never opens a Moonraker port with an MCP key', async () => {
        const moonraker = app.get(MoonrakerAuthService, { strict: false });
        const token = await key('admin', ['mcp_control']);
        expect(await moonraker.verifyKey(token, 'p1')).toBe(false);
        expect(await moonraker.verifyKey(await key('admin', ['moonraker'], 'p1'), 'p1')).toBe(true);
    });

    it('answers 404 when the server is off, and only an admin can switch it', async () => {
        const token = await key('admin', ['mcp_read']);
        const patch = (who: string) =>
            fetch(`${base}/api/v1/settings`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: cookies[who] },
                body: JSON.stringify({ mcpEnabled: false }),
            });
        expect((await patch('operator')).status).toBe(403);
        expect((await rpc(token, 'tools/list')).status).toBe(200);
        expect((await patch('admin')).status).toBe(200);
        expect((await rpc(token, 'tools/list')).status).toBe(404);
        expect((await fetch(`${base}/.well-known/oauth-protected-resource${MCP_PATH}`)).status).toBe(404);
        expect((await post('/api/auth/oauth2/register', { redirect_uris: [REDIRECT] })).status).toBe(403);
        await settings.update({ mcpEnabled: true });
    });
});

describe('MCP question in the chat', () => {
    const PROTOCOL = '2025-11-25';

    async function session(token: string, capabilities: object) {
        const headers = { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' };
        const clientInfo = { name: 'test', version: '1' };
        const params = { protocolVersion: PROTOCOL, capabilities, clientInfo };
        const res = await post(MCP_PATH, { jsonrpc: '2.0', id: 0, method: 'initialize', params }, headers);
        await res.text();
        const id = res.headers.get('mcp-session-id') ?? '';
        const send = (body: object, bearer = token) =>
            post(
                MCP_PATH,
                { jsonrpc: '2.0', ...body },
                {
                    ...headers,
                    authorization: `Bearer ${bearer}`,
                    'mcp-session-id': id,
                    'mcp-protocol-version': PROTOCOL,
                },
            );
        await send({ method: 'notifications/initialized' });
        return { id, send };
    }

    const remove = {
        id: 7,
        method: 'tools/call',
        params: { name: 'remove_from_queue', arguments: { itemId: 'none' } },
    };

    async function messages(res: Response, onMessage: (m: { id?: number; method?: string }) => Promise<unknown>) {
        let last = '';
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            last += new TextDecoder().decode(chunk);
            for (const line of last.split('\n').slice(0, -1)) {
                if (line.startsWith('data: {')) await onMessage(JSON.parse(line.slice(6)));
            }
            last = last.slice(last.lastIndexOf('\n') + 1);
        }
    }

    it.each(['accept', 'decline'])('asks, then follows the answer: %s', async (action) => {
        await settings.update({ mcpTools: { remove_from_queue: 'ask' } });
        const token = await key('admin', ['mcp_control']);
        const s = await session(token, { elicitation: {} });
        let asked = 0;
        let result: { isError?: boolean } | undefined;
        await messages(await s.send(remove), async (msg) => {
            if (msg.method === 'elicitation/create') {
                asked++;
                await s.send({ id: msg.id, result: { action } });
            } else if (msg.id === 7) result = (msg as { result?: { isError?: boolean } }).result;
        });
        expect(asked).toBe(1);
        expect(result?.isError === true).toBe(action === 'decline');
        await settings.update({ mcpTools: { remove_from_queue: 'allow' } });
    });

    it('refuses when the application cannot ask, with or without a session', async () => {
        await settings.update({ mcpTools: { remove_from_queue: 'ask' } });
        const token = await key('admin', ['mcp_control']);
        const s = await session(token, {});
        expect(await (await s.send(remove)).text()).toContain('cannot ask');
        expect((await rpc(token, 'tools/call', remove.params)).body.result.content[0].text).toContain('cannot ask');
        await settings.update({ mcpTools: { remove_from_queue: 'allow' } });
    });

    it('keeps a session to its key and to the current permissions', async () => {
        const token = await key('admin', ['mcp_control']);
        const s = await session(token, {});
        const count = async () =>
            ((await (await s.send({ id: 1, method: 'tools/list' })).text()).match(/"inputSchema"/g) ?? []).length;
        expect(await count()).toBe(56);
        await settings.update({ mcpTools: { remove_from_queue: 'deny' } });
        expect(await count()).toBe(55);
        await settings.update({ mcpTools: { remove_from_queue: 'allow' } });
        const other = await key('admin', ['mcp_control']);
        expect((await s.send({ id: 1, method: 'tools/list' }, other)).status).toBe(404);
        await getPrisma().apikey.updateMany({ data: { enabled: false } });
        expect((await s.send({ id: 1, method: 'tools/list' })).status).toBe(401);
    });
});

describe('API key uses', () => {
    it('refuses keys without a use, with two MCP accesses or an MCP key bound to a printer', async () => {
        for (const metadata of [
            undefined,
            { uses: [] },
            { uses: ['mcp_read', 'mcp_control'] },
            { printerId: 'p1', uses: ['mcp_read'] },
            { uses: ['nope'] },
        ]) {
            expect((await createKey('admin', metadata)).status).toBe(400);
        }
    });

    it('opens only the ticked uses and the chosen printer', async () => {
        const moonraker = app.get(MoonrakerAuthService, { strict: false });
        const metrics = (token: string) =>
            fetch(`${base}/api/v1/metrics`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.status);
        const onlyMetrics = await key('admin', ['metrics']);
        expect(await metrics(onlyMetrics)).toBe(200);
        expect(await moonraker.verifyKey(onlyMetrics, 'p1')).toBe(false);
        expect((await rpc(onlyMetrics, 'tools/list')).status).toBe(401);
        const printerOnly = await key('admin', ['moonraker'], 'p1');
        expect(await metrics(printerOnly)).toBe(401);
        expect(await moonraker.verifyKey(printerOnly, 'p1')).toBe(true);
        expect(await moonraker.verifyKey(printerOnly, 'p2')).toBe(false);
        const all = await key('admin', ['moonraker', 'metrics', 'mcp_read']);
        expect(await metrics(all)).toBe(200);
        expect(await moonraker.verifyKey(all, 'p2')).toBe(true);
        expect((await rpc(all, 'tools/list')).body.result.tools).toHaveLength(20);
        expect(await metrics(await key('admin', ['mcp_control']))).toBe(401);
    });
});

describe('MCP permissions over HTTP', () => {
    it('only lets an admin change the permissions, and serves the catalog', async () => {
        const patch = (who: string, mode: string) =>
            fetch(`${base}/api/v1/settings`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: cookies[who] },
                body: JSON.stringify({ mcpTools: { set_fan: mode } }),
            });
        expect((await patch('operator', 'deny')).status).toBe(403);
        expect((await patch('admin', 'whatever')).status).toBe(400);
        expect((await patch('admin', 'allow')).status).toBe(200);
        expect(settings.get().mcpTools).toEqual({ remove_from_queue: 'allow', set_fan: 'allow' });
        const res = await fetch(`${base}/api/v1/mcp/tools`, { headers: { cookie: cookies.viewer } });
        const names = ((await res.json()) as { name: string }[]).map((t) => t.name);
        expect(names.sort()).toEqual([...MCP_TOOL_NAMES].sort());
    });
});

describe('MCP access with OAuth', () => {
    async function connect(who: string, accepted: string) {
        const registered = await post('/api/auth/oauth2/register', {
            client_name: 'Assistant',
            redirect_uris: [REDIRECT],
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
        });
        const { client_id } = (await registered.json()) as { client_id: string };
        const verifier = randomBytes(32).toString('base64url');
        const query = new URLSearchParams({
            response_type: 'code',
            client_id,
            redirect_uri: REDIRECT,
            scope: 'mcp:read mcp:control offline_access',
            state: 's',
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256',
            resource: RESOURCE,
        });
        const authorize = (cookie?: string) =>
            fetch(`${base}/api/auth/oauth2/authorize?${query}`, {
                redirect: 'manual',
                headers: cookie ? { cookie } : {},
            });
        const anonymous = new URL((await authorize()).headers.get('location') ?? '', ORIGIN);
        const consentUrl = new URL((await authorize(cookies[who])).headers.get('location') ?? '', ORIGIN);
        const consent = await post(
            '/api/auth/oauth2/consent',
            { accept: true, scope: accepted, oauth_query: consentUrl.search.slice(1) },
            { cookie: cookies[who] },
        );
        const { url } = (await consent.json()) as { url: string };
        const token = async (form: Record<string, string>) => {
            const res = await fetch(`${base}/api/auth/oauth2/token`, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ client_id, resource: RESOURCE, ...form }),
            });
            return (await res.json()) as { access_token: string; refresh_token: string; scope: string };
        };
        const tokens = await token({
            grant_type: 'authorization_code',
            code: new URL(url).searchParams.get('code') ?? '',
            redirect_uri: REDIRECT,
            code_verifier: verifier,
        });
        return { anonymous, consentUrl, url, tokens, token };
    }

    it('publishes the discovery documents', async () => {
        const res = await fetch(`${base}/.well-known/oauth-protected-resource${MCP_PATH}`);
        const doc = (await res.json()) as { resource: string; authorization_servers: string[] };
        expect(doc.resource).toBe(RESOURCE);
        const meta = await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`);
        expect(await meta.json()).toMatchObject({
            issuer: doc.authorization_servers[0],
            registration_endpoint: `${ORIGIN}/api/auth/oauth2/register`,
        });
    });

    it('signs in, consents, controls, refreshes and is cut off when disconnected', async () => {
        const c = await connect('admin', 'mcp:read mcp:control offline_access');
        expect(c.anonymous.pathname).toBe('/login');
        expect(c.consentUrl.pathname).toBe('/oauth/consent');
        expect(c.url.startsWith(REDIRECT)).toBe(true);
        expect((await rpc(c.tokens.access_token, 'tools/list')).body.result.tools).toHaveLength(56);
        const next = await c.token({ grant_type: 'refresh_token', refresh_token: c.tokens.refresh_token });
        expect((await rpc(next.access_token, 'tools/list')).status).toBe(200);

        const list = await fetch(`${base}/api/v1/mcp/connections`, { headers: { cookie: cookies.admin } });
        const [row] = (await list.json()) as { id: string; redirectHosts: string[]; access: string }[];
        expect(row).toMatchObject({ redirectHosts: ['client.example'], access: 'control' });
        const remove = (who: string) =>
            fetch(`${base}/api/v1/mcp/connections/${row.id}`, {
                method: 'DELETE',
                headers: { cookie: cookies[who], origin: ORIGIN },
            });
        expect((await remove('operator')).status).toBe(404);
        expect((await remove('admin')).status).toBe(204);
        expect((await rpc(next.access_token, 'tools/list')).status).toBe(401);
        const dead = await c.token({ grant_type: 'refresh_token', refresh_token: next.refresh_token });
        expect(dead.access_token).toBeUndefined();
    });

    it('keeps to reading when the user or the role only allows it', async () => {
        const narrowed = await connect('admin', 'mcp:read offline_access');
        expect((await rpc(narrowed.tokens.access_token, 'tools/list')).body.result.tools).toHaveLength(20);
        const viewer = await connect('viewer', 'mcp:read mcp:control');
        expect((await rpc(viewer.tokens.access_token, 'tools/list')).body.result.tools).toHaveLength(20);
    });

    it('does not let an OAuth token reach the dashboard API', async () => {
        const c = await connect('operator', 'mcp:read mcp:control');
        const res = await fetch(`${base}/api/v1/settings`, {
            headers: { authorization: `Bearer ${c.tokens.access_token}` },
        });
        expect(res.status).toBe(401);
    });
});
