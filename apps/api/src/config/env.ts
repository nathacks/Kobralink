import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface KobralinkEnv {
    dataDir: string;
    gcodeDir: string;
    databaseUrl: string;

    port: number;

    baseUrl: string;
    authSecret: string;

    webDir: string | null;

    certsDir: string;

    migrationsDir: string;

    extraOrigins: string[];
    isDev: boolean;
}

let cached: KobralinkEnv | null = null;

function apiRoot(): string {
    return path.resolve(__dirname, '..', '..');
}

function ensureSecret(dataDir: string): string {
    if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
    const file = path.join(dataDir, '.auth-secret');
    try {
        const existing = fs.readFileSync(file, 'utf8').trim();
        if (existing.length >= 32) return existing;
    } catch {}
    const secret = randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
}

export function loadEnv(): KobralinkEnv {
    if (cached) return cached;
    const root = apiRoot();
    const dataDir = process.env.KOBRALINK_DATA_DIR
        ? path.resolve(process.env.KOBRALINK_DATA_DIR)
        : path.resolve(root, '..', '..', 'data');
    const gcodeDir = path.join(dataDir, 'gcodes');
    fs.mkdirSync(gcodeDir, { recursive: true });

    const port = Number(process.env.KOBRALINK_PORT ?? 7100);
    const baseUrl = (process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
    const webDirEnv = process.env.KOBRALINK_WEB_DIR
        ? path.resolve(process.env.KOBRALINK_WEB_DIR)
        : path.resolve(root, '..', 'web', 'dist');
    const webDir = fs.existsSync(path.join(webDirEnv, 'index.html')) ? webDirEnv : null;

    cached = {
        dataDir,
        gcodeDir,
        databaseUrl: process.env.DATABASE_URL ?? `file:${path.join(dataDir, 'kobralink.db')}`,
        port,
        baseUrl,
        authSecret: ensureSecret(dataDir),
        webDir,
        certsDir: process.env.KOBRALINK_CERTS_DIR ?? path.join(root, 'certs'),
        migrationsDir: path.join(root, 'prisma', 'migrations'),
        extraOrigins: (process.env.KOBRALINK_EXTRA_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        isDev: process.env.NODE_ENV !== 'production',
    };
    return cached;
}
