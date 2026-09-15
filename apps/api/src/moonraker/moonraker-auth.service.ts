import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { KobralinkAuth } from '../auth/auth';
import { SettingsService } from '../settings/settings.service';

const KEY_CACHE_TTL_MS = 30_000;
const ONESHOT_TTL_MS = 5_000;
const OPEN_PATHS = new Set(['/', '/access/info', '/access/login', '/access/refresh_jwt']);

interface IncomingLike {
    headers: IncomingMessage['headers'];
    url?: string;
}

@Injectable()
export class MoonrakerAuthService {
    private readonly log = new Logger(MoonrakerAuthService.name);
    private readonly validKeys = new Map<string, { exp: number; printerId: string | null }>();
    private readonly oneshots = new Map<string, number>();

    constructor(
        private readonly auth: AuthService<KobralinkAuth>,
        private readonly settings: SettingsService,
    ) {}

    get required(): boolean {
        return this.settings.get().moonrakerApiKey;
    }

    isOpenPath(path: string): boolean {
        const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
        return OPEN_PATHS.has(clean) || clean.startsWith('/serve/');
    }

    issueOneshot(): string {
        const token = randomBytes(24).toString('base64url');
        const now = Date.now();
        for (const [t, exp] of this.oneshots) if (exp < now) this.oneshots.delete(t);
        this.oneshots.set(token, now + ONESHOT_TTL_MS);
        return token;
    }

    private consumeOneshot(token: string): boolean {
        const exp = this.oneshots.get(token);
        if (exp === undefined) return false;
        this.oneshots.delete(token);
        return exp >= Date.now();
    }

    async verifyKey(key: string, printerId: string): Promise<boolean> {
        if (!key) return false;
        const cached = this.validKeys.get(key);
        if (cached !== undefined && cached.exp > Date.now()) return this.matches(cached.printerId, printerId);
        let scope: string | null = null;
        try {
            const res = await this.auth.api.verifyApiKey({ body: { key } });
            if (!res.valid) return false;
            const meta = res.key?.metadata as { printerId?: unknown } | null | undefined;
            scope = typeof meta?.printerId === 'string' && meta.printerId ? meta.printerId : null;
        } catch (e) {
            this.log.warn(`API key verification failed: ${(e as Error).message}`);
            return false;
        }
        this.validKeys.set(key, { exp: Date.now() + KEY_CACHE_TTL_MS, printerId: scope });
        return this.matches(scope, printerId);
    }

    private matches(scope: string | null, printerId: string): boolean {
        return scope === null || scope === printerId;
    }

    invalidateCache(): void {
        this.validKeys.clear();
    }

    async authorize(req: IncomingLike, printerId: string): Promise<boolean> {
        if (!this.required) return true;
        const url = new URL(req.url ?? '/', 'http://moonraker');
        const oneshot = url.searchParams.get('token');
        if (oneshot && this.consumeOneshot(oneshot)) return true;
        const header = req.headers['x-api-key'];
        const fromHeader = Array.isArray(header) ? header[0] : header;
        const bearer = req.headers.authorization;
        const fromBearer =
            typeof bearer === 'string' && /^bearer\s+/i.test(bearer) ? bearer.replace(/^bearer\s+/i, '') : '';
        const fromQuery = url.searchParams.get('api_key') ?? url.searchParams.get('apikey') ?? '';
        return this.verifyKey((fromHeader ?? '').trim() || fromBearer.trim() || fromQuery.trim(), printerId);
    }
}
