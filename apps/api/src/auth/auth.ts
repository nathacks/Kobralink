import { AsyncLocalStorage } from 'node:async_hooks';
import { apiKey } from '@better-auth/api-key';
import { canOperate, type UserRole } from '@kobralink/shared';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { loadEnv } from '../config/env';
import { m } from '../i18n/locale';
import { getPrisma } from '../prisma/prisma.service';

export const internalSignup = new AsyncLocalStorage<boolean>();

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
            apiKey({
                defaultPrefix: 'kl_',
                defaultKeyLength: 40,
                apiKeyHeaders: 'x-api-key',
                enableMetadata: true,
                rateLimit: { enabled: false },
                keyExpiration: { defaultExpiresIn: null },
            }),
        ],
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                if (!ctx.path.startsWith('/api-key/')) return;
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
