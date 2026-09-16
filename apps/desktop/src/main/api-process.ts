import fs from 'node:fs';
import path from 'node:path';
import { app, type UtilityProcess, utilityProcess } from 'electron';

const RESTART_EXIT_CODE = 75;

export const LOCAL_PORT = Number(process.env.KOBRALINK_PORT) || 7100;

let child: UtilityProcess | null = null;

function apiEntry(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, 'api', 'dist', 'server', 'main.js');
    return path.resolve(__dirname, '../../../api/dist/main.js');
}

function webDir(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, 'web');
    return path.resolve(__dirname, '../../../web/dist');
}

export function apiAvailable(): boolean {
    return fs.existsSync(apiEntry());
}

export function startLocalApi(port: number): UtilityProcess {
    if (child) return child;
    const dataDir = path.join(app.getPath('userData'), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const entry = apiEntry();
    child = utilityProcess.fork(entry, [], {
        cwd: path.dirname(entry),
        stdio: 'pipe',
        env: {
            ...process.env,
            NODE_ENV: 'production',
            KOBRALINK_DATA_DIR: dataDir,
            KOBRALINK_PORT: String(port),
            KOBRALINK_WEB_DIR: webDir(),
            KOBRALINK_PACKAGED: 'electron',
            KOBRALINK_VERSION: app.getVersion(),
            BETTER_AUTH_URL: `http://localhost:${port}`,
        },
    });
    child.stdout?.on('data', (d) => process.stdout.write(`[api] ${d}`));
    child.stderr?.on('data', (d) => process.stderr.write(`[api] ${d}`));
    child.on('exit', (code) => {
        console.log(`[api] exited (code ${code})`);
        child = null;
        if (code === RESTART_EXIT_CODE) setTimeout(() => startLocalApi(port), 500);
    });
    return child;
}

export function stopLocalApi(): void {
    child?.kill();
    child = null;
}

export async function waitForApi(baseUrl: string, timeoutMs = 30000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${baseUrl}/api/v1/setup/status`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) return true;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}
