import os from 'node:os';

function toInt(ip: string): number {
    return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

export function localIpFor(remoteIp: string): string {
    const remote = toInt(remoteIp);
    let fallback = '127.0.0.1';
    for (const entries of Object.values(os.networkInterfaces())) {
        for (const e of entries ?? []) {
            if (e.family !== 'IPv4' || e.internal) continue;
            if (fallback === '127.0.0.1') fallback = e.address;
            const mask = toInt(e.netmask);
            if ((toInt(e.address) & mask) === (remote & mask)) return e.address;
        }
    }
    return fallback;
}

export function lanIps(): string[] {
    const out: string[] = [];
    for (const entries of Object.values(os.networkInterfaces())) {
        for (const e of entries ?? []) {
            if (e.family === 'IPv4' && !e.internal) out.push(e.address);
        }
    }
    return out;
}
