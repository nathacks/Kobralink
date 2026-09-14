import { createDecipheriv, createHash } from 'node:crypto';
import { KobraProtocolError } from './errors';

export interface FetchedCredentials {
    printerIp: string;
    username: string;
    password: string;
    deviceId: string;
    modeId: string;
    model: string;
}

function md5(s: string): string {
    return createHash('md5').update(s).digest('hex');
}

export function generateSignature(token: string, ts: number, nonce: string): string {
    return md5(md5(token.slice(0, 16)) + String(ts) + nonce);
}

export function decryptInfo(encryptedB64: string, key: string, iv: string): Record<string, unknown> {
    const decipher = createDecipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
    const out = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
}

function randomNonce(len = 6): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
}

// biome-ignore lint/suspicious/noExplicitAny: untyped printer JSON
async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        if (!res.ok)
            throw new KobraProtocolError('http_status', { status: res.status, url }, `HTTP ${res.status} on ${url}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

export async function fetchPrinterCredentials(
    ip: string,
    port = 18910,
    timeoutMs = 10000,
): Promise<FetchedCredentials> {
    const base = `http://${ip}:${port}`;
    const info = await fetchJson(`${base}/info`, { method: 'GET' }, timeoutMs);
    const token: string = info?.token;
    if (typeof token !== 'string' || token.length < 32) {
        throw new KobraProtocolError(
            'info_invalid',
            {},
            'Invalid /info response (missing token) — is LAN mode enabled?',
        );
    }
    const ts = Date.now();
    const nonce = randomNonce();
    const sign = generateSignature(token, ts, nonce);
    const params = new URLSearchParams({ ts: String(ts), nonce, sign, did: 'random' });
    const ctrl = await fetchJson(`${base}/ctrl?${params}`, { method: 'POST' }, timeoutMs);
    const encrypted = ctrl?.data?.info;
    const ctrlToken = ctrl?.data?.token;
    if (typeof encrypted !== 'string' || typeof ctrlToken !== 'string') {
        throw new KobraProtocolError('ctrl_invalid', {}, 'Invalid /ctrl response');
    }
    const result = decryptInfo(encrypted, token.slice(16, 32), ctrlToken);
    if (result.error) throw new Error(String(result.error));
    return {
        printerIp: String(result.ip ?? ip),
        username: String(result.username ?? ''),
        password: String(result.password ?? ''),
        deviceId: String(result.deviceId ?? ''),
        modeId: String(result.modeId ?? '20030'),
        model: String(result.modelName ?? 'Anycubic Kobra'),
    };
}
