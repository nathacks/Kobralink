import type { GcodeFileDto } from '@kobralink/shared';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ParsedGcode, WorkerResponse } from '@/lib/gcode-parser.worker';
import { m } from '@/lib/i18n';

export type ParsedGcodeStatus =
    | { kind: 'loading'; progress: number }
    | { kind: 'ready'; data: ParsedGcode }
    | { kind: 'error'; message: string };

export function useParsedGcode(printerId: string, file: GcodeFileDto) {
    const [status, setStatus] = useState<ParsedGcodeStatus>({ kind: 'loading', progress: 0 });

    useEffect(() => {
        setStatus({ kind: 'loading', progress: 0 });
        if (file.filename.toLowerCase().endsWith('.bgcode')) {
            setStatus({ kind: 'error', message: m.preview_bgcode() });
            return;
        }
        let cancelled = false;
        const worker = new Worker(new URL('../lib/gcode-parser.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
            if (cancelled) return;
            const msg = ev.data;
            if ('progress' in msg) setStatus({ kind: 'loading', progress: msg.progress });
            else if (msg.ok) setStatus({ kind: 'ready', data: msg.data });
            else setStatus({ kind: 'error', message: msg.error });
        };
        fetch(api.files.downloadUrl(printerId, file.id), { credentials: 'include' })
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((text) => {
                if (!cancelled) worker.postMessage({ text });
            })
            .catch((e: Error) => {
                if (!cancelled) setStatus({ kind: 'error', message: e.message });
            });
        return () => {
            cancelled = true;
            worker.terminate();
        };
    }, [printerId, file.id, file.filename]);

    return status;
}
