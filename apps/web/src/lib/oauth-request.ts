import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';

export interface OAuthSearch {
    oauth?: string;
}

export function oauthSearch(search: Record<string, unknown>): OAuthSearch {
    if (typeof search.oauth === 'string') return { oauth: search.oauth };
    return 'sig' in search ? { oauth: window.location.search.slice(1) } : {};
}

export async function resumeOAuth(path: string, body: Record<string, unknown>, oauthQuery: string): Promise<void> {
    const res = await authClient.$fetch<{ url?: string }>(path, {
        method: 'POST',
        body: { ...body, oauth_query: oauthQuery },
    });
    if (res.error || !res.data.url) throw new Error(res.error?.message ?? m.oauth_invalid());
}
