const NETWORK_ERROR_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ECONNABORTED',
    'EPIPE',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
]);

interface GuardLogger {
    warn: (message: string) => void;
    error: (message: string) => void;
}

interface GuardedProcess {
    on: (event: 'uncaughtException' | 'unhandledRejection', listener: (e: unknown) => void) => unknown;
    exit: (code: number) => unknown;
}

export function isNetworkError(e: unknown): boolean {
    if (typeof e !== 'object' || e === null) return false;
    return NETWORK_ERROR_CODES.has(String((e as { code?: unknown }).code));
}

function describe(e: unknown): string {
    if (e instanceof Error) return e.stack ?? `${e.name}: ${e.message}`;
    return String(e);
}

export function installCrashGuard(log: GuardLogger, proc: GuardedProcess = process): void {
    const handle = (kind: string) => (e: unknown) => {
        if (isNetworkError(e)) {
            const code = String((e as { code?: unknown }).code);
            log.warn(`${kind} network error ignored (${code}): ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        log.error(`${kind}: ${describe(e)}`);
        proc.exit(1);
    };
    proc.on('uncaughtException', handle('Uncaught'));
    proc.on('unhandledRejection', handle('Unhandled rejection'));
}
