import { createFileRoute } from '@tanstack/react-router';
import { ApiKeysLink, CopyKeyButton, METRICS_PATH, prometheusScrape } from '@/components/settings/api-keys-card';
import { useApiUrl } from '@/components/settings/mcp-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { m } from '@/lib/i18n';

export const Route = createFileRoute('/_app/settings/prometheus')({ component: PrometheusPage });

function Snippet({ label, value }: { label: string; value: string }) {
    return (
        <div data-setting className="space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="flex items-start gap-2">
                <code className="block min-w-0 flex-1 whitespace-pre-wrap break-all rounded-2xl bg-secondary/50 px-4 py-3 font-mono text-sm">
                    {value}
                </code>
                {value && <CopyKeyButton value={value} copied={m.mcp_copied()} />}
            </div>
        </div>
    );
}

function PrometheusPage() {
    const url = useApiUrl(METRICS_PATH);
    return (
        <div className="min-w-0 space-y-4">
            <Card className="rounded-3xl">
                <CardHeader>
                    <CardTitle>Prometheus</CardTitle>
                    <CardDescription>{m.prometheus_hint()}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Snippet label={m.prometheus_url()} value={url} />
                    <Snippet label={m.api_keys_created_scrape()} value={url ? prometheusScrape(url, 'kl_…') : ''} />
                    <p className="text-xs text-muted-foreground">{m.prometheus_key_hint()}</p>
                    <ApiKeysLink />
                </CardContent>
            </Card>
        </div>
    );
}
