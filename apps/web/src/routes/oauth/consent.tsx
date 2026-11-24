import { MCP_OFFLINE_SCOPE, MCP_SCOPES, type McpAccess, mcpAccessOf } from '@kobralink/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';
import { oauthSearch, resumeOAuth } from '@/lib/oauth-request';
import { sessionQuery } from '@/lib/session';

export const Route = createFileRoute('/oauth/consent')({
    validateSearch: oauthSearch,
    beforeLoad: async ({ context, search }) => {
        const session = await context.queryClient.query({ ...sessionQuery, staleTime: 'static' });
        if (!session) throw redirect({ to: '/login', search });
        return { session };
    },
    component: ConsentPage,
});

function redirectTarget(uri: string): string {
    try {
        return new URL(uri).host || uri;
    } catch {
        return uri;
    }
}

function ConsentPage() {
    const { oauth = '' } = Route.useSearch();
    const { session } = Route.useRouteContext();
    return <ConsentCard oauth={oauth} email={session.user.email} />;
}

export function ConsentCard({ oauth, email }: { oauth: string; email: string }) {
    const params = new URLSearchParams(oauth);
    const clientId = params.get('client_id') ?? '';
    const scopes = (params.get('scope') ?? '').split(' ').filter(Boolean);
    const asked = mcpAccessOf(scopes);
    const [access, setAccess] = useState<McpAccess>(asked === 'control' ? 'control' : 'read');
    const client = useQuery({
        queryKey: ['oauth-client', clientId],
        queryFn: async () => {
            const res = await authClient.$fetch<{ client_name?: string }>('/oauth2/public-client', {
                query: { client_id: clientId },
            });
            if (res.error) throw new Error(res.error.message ?? m.oauth_invalid());
            return res.data;
        },
        enabled: Boolean(clientId),
        retry: false,
    });
    const answer = useMutation({
        mutationFn: (accept: boolean) => {
            const granted = [
                MCP_SCOPES.read,
                ...(access === 'control' ? [MCP_SCOPES.control] : []),
                MCP_OFFLINE_SCOPE,
            ].filter((s) => scopes.includes(s));
            return resumeOAuth('/oauth2/consent', accept ? { accept, scope: granted.join(' ') } : { accept }, oauth);
        },
    });
    const choices = [
        { value: 'read' as const, label: m.mcp_access_read(), hint: m.mcp_access_read_hint() },
        { value: 'control' as const, label: m.mcp_access_control(), hint: m.mcp_access_control_hint() },
    ].filter((c) => scopes.includes(MCP_SCOPES[c.value]));
    const invalid = !clientId || !asked || client.isError;

    return (
        <div className="flex min-h-svh items-center justify-center p-6 pt-(--inset-top)">
            <div className="w-full max-w-md rounded-3xl bg-card p-8 text-card-foreground">
                <img src="/logo-mark.svg" alt="Kobralink" className="mb-6 size-16" />
                <h1 className="text-2xl font-semibold">{m.oauth_title()}</h1>
                {invalid ? (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                        {m.oauth_invalid()}
                    </p>
                ) : (
                    <>
                        <p className="mt-3 text-sm">
                            {m.oauth_request({ name: client.data?.client_name ?? clientId, email })}
                        </p>
                        <p className="mt-2 text-sm break-words text-muted-foreground">
                            {m.oauth_redirect({ host: redirectTarget(params.get('redirect_uri') ?? '') })}
                        </p>
                        <fieldset className="mt-6 grid gap-2">
                            <legend className="mb-2 text-sm font-medium">{m.mcp_access()}</legend>
                            {choices.map((c) => (
                                <label
                                    key={c.value}
                                    className="flex cursor-pointer items-start gap-3 rounded-2xl bg-secondary/50 px-4 py-3"
                                >
                                    <input
                                        type="radio"
                                        name="access"
                                        className="mt-1 accent-primary"
                                        checked={access === c.value}
                                        onChange={() => setAccess(c.value)}
                                    />
                                    <span>
                                        <span className="block text-sm font-medium">{c.label}</span>
                                        <span className="block text-xs text-muted-foreground">{c.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </fieldset>
                        <div className="mt-6 flex gap-3">
                            <Button
                                variant="secondary"
                                size="lg"
                                className="flex-1 rounded-full"
                                disabled={answer.isPending}
                                onClick={() => answer.mutate(false)}
                            >
                                {m.oauth_deny()}
                            </Button>
                            <Button
                                size="lg"
                                className="flex-1 rounded-full"
                                disabled={answer.isPending || !client.isSuccess}
                                onClick={() => answer.mutate(true)}
                            >
                                {m.oauth_allow()}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
