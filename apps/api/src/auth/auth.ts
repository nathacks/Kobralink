import { AsyncLocalStorage } from 'node:async_hooks';
import { apiKey } from '@better-auth/api-key';
import { mcp } from '@better-auth/mcp';
import {
    apiKeyMetadataSchema,
    canOperate,
    MCP_OFFLINE_SCOPE,
    MCP_PATH,
    MCP_SCOPES,
    type UserRole,
} from '@kobralink/shared';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { loadEnv } from '../config/env';
import { m } from '../i18n/locale';
import { getPrisma } from '../prisma/prisma.service';

export const internalSignup = new AsyncLocalStorage<boolean>();

const apiKeyOptions = {
    defaultKeyLength: 40,
    apiKeyHeaders: 'x-api-key',
    enableMetadata: true,
    rateLimit: { enabled: false },
    keyExpiration: { defaultExpiresIn: null },
};

function oauthPlugins(resource: string) {
    return [
        jwt({ disableSettingJwtHeader: true }),
        mcp({
            loginPage: '/login',
            consentPage: '/oauth/consent',
            resource,
            scopes: [MCP_SCOPES.read, MCP_SCOPES.control, MCP_OFFLINE_SCOPE],
            allowDynamicClientRegistration: true,
            allowUnauthenticatedClientRegistration: true,
            clientRegistrationDefaultApplicationType: 'infer',
            clientPrivileges: ({ action }) => action === 'read',
            resourcePrivileges: () => false,
        }),
    ];
}

export function createAuth() {
    const env = loadEnv();
    const prisma = getPrisma();
    return betterAuth({
        appName: 'Kobralink',
        baseURL: env.baseUrl,
        basePath: '/api/auth',
        secret: env.authSecret,
        database: prismaAdapter(prisma, { provider: 'sqlite' }),
        user: {
            additionalFields: {
                role: { type: 'string', defaultValue: 'admin', input: false },
            },
        },
        emailAndPassword: {
            enabled: true,
            minPasswordLength: 8,
            autoSignIn: true,
        },
        disabledPaths: ['/token'],
        trustedOrigins: [env.baseUrl, ...env.extraOrigins],
        session: {
            expiresIn: 60 * 60 * 24 * 30,
            updateAge: 60 * 60 * 24,
            cookieCache: { enabled: true, maxAge: 5 * 60 },
        },
        advanced: {
            useSecureCookies: env.baseUrl.startsWith('https://'),
            ipAddress: {
                ...(env.trustedProxies.length ? { trustedProxies: env.trustedProxies } : {}),
                ...(env.ipAddressHeaders.length ? { ipAddressHeaders: env.ipAddressHeaders } : {}),
            },
        },
        plugins: [
            apiKey({ ...apiKeyOptions, defaultPrefix: 'kl_' }),
            ...(env.oauthAvailable ? oauthPlugins(`${env.baseUrl}${MCP_PATH}`) : []),
        ],
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                if (ctx.path.startsWith('/oauth2/')) {
                    const row = await prisma.appSetting.findUnique({ where: { key: 'mcpEnabled' } });
                    if (row?.value !== 'true') throw new APIError('FORBIDDEN', { message: m.api_mcp_disabled() });
                    return;
                }
                if (!ctx.path.startsWith('/api-key/')) return;
                const body = ctx.body as { metadata?: unknown } | undefined;
                const setsMetadata = ctx.path === '/api-key/create' || body?.metadata !== undefined;
                if (setsMetadata && !apiKeyMetadataSchema.safeParse(body?.metadata).success) {
                    throw new APIError('BAD_REQUEST', { message: m.api_key_bad_scope() });
                }
                const session = await getSessionFromCtx(ctx);
                if (!session) return;
                const role = (session.user as { role?: UserRole }).role;
                if (!canOperate(role)) throw new APIError('FORBIDDEN', { message: m.api_forbidden_role() });
            }),
        },
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        if (internalSignup.getStore()) return { data: user };
                        const count = await prisma.user.count();
                        if (count > 0) {
                            throw new APIError('FORBIDDEN', {
                                message: m.api_signup_closed(),
                            });
                        }
                        return { data: user };
                    },
                },
            },
        },
    });
}

export type KobralinkAuth = ReturnType<typeof createAuth>;
