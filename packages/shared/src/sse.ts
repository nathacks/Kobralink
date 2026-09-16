export type SseChannel = 'printers' | 'logs';

export type SseParams = Record<string, string>;

export interface SseEnvelope<T = unknown> {
    channel: SseChannel | '*';
    event: string;
    params?: SseParams;
    data: T;
}

export function sseChannelKey(channel: SseChannel, params?: SseParams): string {
    const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '');
    if (!entries.length) return channel;
    const qs = entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join(',');
    return `${channel}:${qs}`;
}

export function parseSseChannelKey(key: string): { channel: SseChannel; params: SseParams } | null {
    const sep = key.indexOf(':');
    const channel = (sep === -1 ? key : key.slice(0, sep)) as SseChannel;
    if (channel !== 'printers' && channel !== 'logs') return null;
    const params: SseParams = {};
    if (sep !== -1) {
        for (const pair of key.slice(sep + 1).split(',')) {
            const eq = pair.indexOf('=');
            if (eq === -1) continue;
            params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
        }
    }
    return { channel, params };
}
