import { createAuthClient } from 'better-auth/react';
import { getLocale } from '@/lib/i18n';

export const authClient = createAuthClient({
    basePath: '/api/auth',
    fetchOptions: { headers: { 'accept-language': getLocale() } },
});

export type Session = typeof authClient.$Infer.Session;
