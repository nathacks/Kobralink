import { apiKeyClient } from '@better-auth/api-key/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { getLocale } from '@/lib/i18n';

export const authClient = createAuthClient({
    basePath: '/api/auth',
    plugins: [inferAdditionalFields({ user: { role: { type: 'string', input: false } } }), apiKeyClient()],
    fetchOptions: {
        onRequest: (ctx) => {
            ctx.headers.set('accept-language', getLocale());
        },
    },
});

export type Session = typeof authClient.$Infer.Session;
