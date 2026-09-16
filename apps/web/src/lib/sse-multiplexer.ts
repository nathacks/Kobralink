import { type SseChannel, type SseEnvelope, type SseParams, sseChannelKey } from '@kobralink/shared';

export type SseHandler<T = unknown> = (data: T) => void;
export type SseStatus = 'idle' | 'connecting' | 'open' | 'error';
export type SseStatusListener = (status: SseStatus) => void;

interface Subscription {
    channel: SseChannel;
    params?: SseParams;
    handlers: Map<string, Set<SseHandler>>;
}

const ENDPOINT = '/api/v1/events/multiplexed';
const RECONNECT_DELAY = 5000;
const SYNC_DEBOUNCE = 50;
const WATCHDOG_INTERVAL = 15_000;
const STALE_THRESHOLD = 90_000;

export class SseMultiplexer {
    private source: EventSource | null = null;
    private readonly subscriptions = new Map<string, Subscription>();
    private activeKeys = new Set<string>();
    private syncTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private watchdog: ReturnType<typeof setInterval> | null = null;
    private lastMessageAt = 0;
    private status: SseStatus = 'idle';
    private readonly statusListeners = new Set<SseStatusListener>();

    subscribe<T = unknown>(channel: SseChannel, event: string, handler: SseHandler<T>, params?: SseParams): () => void {
        const key = sseChannelKey(channel, params);
        let sub = this.subscriptions.get(key);
        if (!sub) {
            sub = { channel, params, handlers: new Map() };
            this.subscriptions.set(key, sub);
        }
        let handlers = sub.handlers.get(event);
        if (!handlers) {
            handlers = new Set();
            sub.handlers.set(event, handlers);
        }
        handlers.add(handler as SseHandler);
        this.scheduleSync();
        return () => this.unsubscribe(key, event, handler as SseHandler);
    }

    onStatus(listener: SseStatusListener): () => void {
        this.statusListeners.add(listener);
        listener(this.status);
        return () => this.statusListeners.delete(listener);
    }

    getStatus(): SseStatus {
        return this.status;
    }

    disconnect(): void {
        if (this.syncTimer) clearTimeout(this.syncTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.syncTimer = null;
        this.reconnectTimer = null;
        this.close();
        this.setStatus('idle');
    }

    private unsubscribe(key: string, event: string, handler: SseHandler): void {
        const sub = this.subscriptions.get(key);
        if (!sub) return;
        const handlers = sub.handlers.get(event);
        if (!handlers) return;
        handlers.delete(handler);
        if (!handlers.size) sub.handlers.delete(event);
        if (sub.handlers.size) return;
        this.subscriptions.delete(key);
        this.scheduleSync();
    }

    private scheduleSync(): void {
        if (this.syncTimer) return;
        this.syncTimer = setTimeout(() => {
            this.syncTimer = null;
            this.sync();
        }, SYNC_DEBOUNCE);
    }

    private sync(): void {
        const desired = [...this.subscriptions.keys()];
        if (!desired.length) {
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
            this.close();
            this.setStatus('idle');
            return;
        }
        if (!this.source) {
            this.connect();
            return;
        }
        if (desired.length !== this.activeKeys.size || !desired.every((k) => this.activeKeys.has(k))) {
            this.close();
            this.connect();
        }
    }

    private connect(): void {
        if (this.source) return;
        const keys = [...this.subscriptions.keys()];
        if (!keys.length) return;

        const url = new URL(ENDPOINT, window.location.origin);
        url.searchParams.set('channels', keys.map((k) => encodeURIComponent(k)).join(','));

        const es = new EventSource(url.toString(), { withCredentials: true });
        this.source = es;
        this.activeKeys = new Set(keys);
        this.setStatus('connecting');

        es.onopen = () => {
            this.lastMessageAt = Date.now();
            this.setStatus('open');
            this.startWatchdog();
        };
        es.onmessage = (e) => {
            this.lastMessageAt = Date.now();
            let env: SseEnvelope;
            try {
                env = JSON.parse(e.data);
            } catch {
                return;
            }
            if (env.channel === '*') return;
            this.dispatch(env);
        };
        es.onerror = () => {
            this.setStatus('error');
            this.close();
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, RECONNECT_DELAY);
        };
    }

    private dispatch(env: SseEnvelope): void {
        const sub = this.subscriptions.get(sseChannelKey(env.channel as SseChannel, env.params));
        const handlers = sub?.handlers.get(env.event);
        if (!handlers) return;
        for (const h of handlers) {
            try {
                h(env.data);
            } catch (err) {
                console.error(`[sse] handler failed for ${env.channel}/${env.event}`, err);
            }
        }
    }

    private startWatchdog(): void {
        this.stopWatchdog();
        this.watchdog = setInterval(() => {
            if (!this.source) return;
            if (Date.now() - this.lastMessageAt <= STALE_THRESHOLD) return;
            console.warn('[sse] stream stale, reconnecting');
            this.close();
            this.connect();
        }, WATCHDOG_INTERVAL);
    }

    private stopWatchdog(): void {
        if (this.watchdog) clearInterval(this.watchdog);
        this.watchdog = null;
    }

    private close(): void {
        this.stopWatchdog();
        this.source?.close();
        this.source = null;
        this.activeKeys.clear();
    }

    private setStatus(status: SseStatus): void {
        if (this.status === status) return;
        this.status = status;
        for (const l of this.statusListeners) l(status);
    }
}

export const sseMultiplexer = new SseMultiplexer();
