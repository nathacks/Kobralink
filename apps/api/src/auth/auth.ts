import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { loadEnv } from '../config/env';
import { getPrisma } from '../prisma/prisma.service';

export function createAuth() {
    const env = loadEnv();
    const prisma = getPrisma();
    return betterAuth({
        appName: 'Kobralink',
        baseURL: env.baseUrl,
        basePath: '/api/auth',
        secret: env.authSecret,
        database: prismaAdapter(prisma, { provider: 'sqlite' }),
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
        },
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        const count = await prisma.user.count();
                        if (count > 0) {
                            throw new APIError('FORBIDDEN', {
                                message: 'Inscription fermée : un compte existe déjà sur ce bridge.',
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
