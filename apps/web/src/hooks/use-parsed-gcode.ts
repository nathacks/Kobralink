import type { GcodeFileDto } from '@kobralink/shared';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ParsedGcode, WorkerRequest, WorkerResponse } from '@/lib/gcode-parser.worker';
import { m } from '@/lib/i18n';

export type ParsedGcodeStatus =
    | { kind: 'loading'; progress: number }
    | { kind: 'ready'; data: ParsedGcode }
    | { kind: 'error'; message: string };

async function parseGcode(url: string, signal: AbortSignal, onProgress: (p: number) => void): Promise<ParsedGcode> {
    const res = await fetch(url, { credentials: 'include', signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    signal.throwIfAborted();
    const worker = new Worker(new URL('../lib/gcode-parser.worker.ts', import.meta.url), { type: 'module' });
    try {
        return await new Promise<ParsedGcode>((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            worker.onerror = (ev) => reject(new Error(ev.message));
            worker.onmessage = ({ data: msg }: MessageEvent<WorkerResponse>) => {
                if ('progress' in msg) onProgress(msg.progress);
                else if (msg.ok) resolve(msg.data);
                else reject(new Error(msg.error));
            };
            worker.postMessage({ text } satisfies WorkerRequest);
        });
    } finally {
        worker.terminate();
    }
}

export function useParsedGcode(printerId: string, file: GcodeFileDto): ParsedGcodeStatus {
    const qc = useQueryClient();
    const binary = file.filename.toLowerCase().endsWith('.bgcode');
    const queryKey = ['parsed-gcode', printerId, file.id];
    const progressKey = ['parsed-gcode-progress', printerId, file.id];
    const parsed = useQuery({
        queryKey,
        queryFn: ({ signal }) => {
            qc.setQueryData(progressKey, 0);
            return parseGcode(api.files.downloadUrl(printerId, file.id), signal, (p) =>
                qc.setQueryData(progressKey, p),
            );
        },
        enabled: !binary,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 60_000,
        meta: { silent: true },
    });
    const progress = useQuery<number>({ queryKey: progressKey, queryFn: skipToken });

    if (binary) return { kind: 'error', message: m.preview_bgcode() };
    if (parsed.data) return { kind: 'ready', data: parsed.data };
    if (parsed.error) return { kind: 'error', message: parsed.error.message };
    return { kind: 'loading', progress: progress.data ?? 0 };
}
