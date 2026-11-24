import { requireMcpAuth } from '@better-auth/mcp';
import {
    canOperate,
    MCP_KEY_USES,
    MCP_PATH,
    MCP_SCOPES,
    type McpAccess,
    type McpConnectionDto,
    mcpAccessOf,
    type UserRole,
} from '@kobralink/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { createInsufficientScopeError } from 'better-auth/oauth2';
import { ApiKeyService } from '../auth/api-key.service';
import type { KobralinkAuth } from '../auth/auth';
import { loadEnv } from '../config/env';
import { m } from '../i18n/locale';
import { PrismaService } from '../prisma/prisma.service';

const API_KEY_PREFIX = 'kl_';

export interface McpPrincipal {
    id: string;
    label: string;
    userId: string;
    access: McpAccess;
}

type Serve = (request: Request, principal: McpPrincipal) => Promise<Response>;

@Injectable()
export class McpAuthService {
    constructor(
        private readonly auth: AuthService<KobralinkAuth>,
        private readonly apiKeys: ApiKeyService,
        private readonly prisma: PrismaService,
    ) {}

    async handle(request: Request, serve: Serve): Promise<Response> {
        const bearer = /^bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1].trim() ?? '';
        if (bearer.startsWith(API_KEY_PREFIX)) {
            const principal = await this.fromApiKey(bearer);
            return principal ? serve(request, principal) : unauthorized('Invalid or revoked API key');
        }
        if (!loadEnv().oauthAvailable) return unauthorized('Send a Kobralink MCP API key as a Bearer token');
        return this.fromOAuth(request, serve);
    }

    private async fromApiKey(key: string): Promise<McpPrincipal | null> {
        const verified = await this.apiKeys.verify(key, MCP_KEY_USES);
        if (!verified || verified.printerId !== null) return null;
        const wanted = verified.uses.includes('mcp_control') ? 'control' : 'read';
        return this.principal(verified.userId, wanted, `key:${verified.id}`, verified.name);
    }

    private fromOAuth(request: Request, serve: Serve): Promise<Response> {
        return requireMcpAuth(
            this.auth.instance,
            async (req, claims) => {
                const userId = String(claims.sub ?? '');
                const clientId = String(claims.azp ?? '');
                const consent = await this.prisma.client.oauthConsent.findFirst({
                    where: { userId, clientId },
                    include: { client: true },
                });
                if (!consent || consent.client.disabled) return unauthorized('This application was disconnected');
                const consented = parseList(consent.scopes);
                const scopes = String(claims.scope ?? '')
                    .split(' ')
                    .filter((s) => consented.includes(s));
                const access = mcpAccessOf(scopes);
                if (!access) throw createInsufficientScopeError([MCP_SCOPES.read]);
                const principal = await this.principal(
                    userId,
                    access,
                    `app:${clientId}:${userId}`,
                    consent.client.name ?? clientId,
                );
                return principal ? serve(req, principal) : unauthorized('Unknown user');
            },
            { resource: `${loadEnv().baseUrl}${MCP_PATH}`, challengeScopes: Object.values(MCP_SCOPES) },
        )(request);
    }

    private async principal(
        userId: string,
        wanted: McpAccess,
        id: string,
        label: string,
    ): Promise<McpPrincipal | null> {
        const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
        if (!user) return null;
        const access = wanted === 'control' && canOperate(user.role as UserRole) ? 'control' : 'read';
        return { id, label: `${label} (${user.name})`, userId, access };
    }

    async connections(userId: string): Promise<McpConnectionDto[]> {
        const rows = await this.prisma.client.oauthConsent.findMany({
            where: { userId },
            include: { client: true },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => ({
            id: r.id,
            name: r.client.name ?? r.clientId,
            redirectHosts: [...new Set(parseList(r.client.redirectUris).map(hostOf))],
            access: mcpAccessOf(parseList(r.scopes)),
            createdAt: r.createdAt.toISOString(),
        }));
    }

    async disconnect(userId: string, id: string): Promise<void> {
        const row = await this.prisma.client.oauthConsent.findFirst({ where: { id, userId } });
        if (!row) throw new NotFoundException(m.api_mcp_connection_not_found());
        const where = { userId, clientId: row.clientId };
        await this.prisma.client.$transaction([
            this.prisma.client.oauthConsent.deleteMany({ where }),
            this.prisma.client.oauthAccessToken.deleteMany({ where }),
            this.prisma.client.oauthRefreshToken.deleteMany({ where }),
        ]);
    }
}

function unauthorized(message: string): Response {
    return Response.json(
        { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
        { status: 401, headers: { 'www-authenticate': 'Bearer' } },
    );
}

function parseList(raw: string): string[] {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.map(String) : [];
    } catch {
        return [];
    }
}

function hostOf(uri: string): string {
    try {
        return new URL(uri).host || uri;
    } catch {
        return uri;
    }
}
