import type { PushSubscriptionInput } from '@kobralink/shared';
import { api } from '@/lib/api';

export type PushSupport = 'ok' | 'unsupported' | 'insecure';

export function pushSupport(): PushSupport {
    if ((window as unknown as { kobralinkDesktop?: unknown }).kobralinkDesktop) return 'unsupported';
    if (!window.isSecureContext) return 'insecure';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return 'unsupported';
    }
    return 'ok';
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
    if (pushSupport() !== 'ok') return null;
    const reg = await navigator.serviceWorker.getRegistration('/');
    return (await reg?.pushManager.getSubscription()) ?? null;
}

function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
    const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function enablePush(): Promise<PushSubscription> {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const { publicKey } = await api.push.key();
    const key = toBytes(publicKey);
    let existing = await reg.pushManager.getSubscription();
    const existingKey = existing?.options.applicationServerKey;
    if (existing && existingKey && !sameBytes(new Uint8Array(existingKey), key)) {
        await existing.unsubscribe();
        existing = null;
    }
    const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    await api.push.subscribe(sub.toJSON() as PushSubscriptionInput);
    return sub;
}

export async function disablePush(sub: PushSubscription): Promise<void> {
    await api.push.unsubscribe(sub.endpoint);
    await sub.unsubscribe();
}
