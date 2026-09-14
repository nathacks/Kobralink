import type { GcodeFileDto } from '@kobralink/shared';
import { Crosshair, RotateCcw } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import type { ParsedGcode, WorkerResponse } from '@/lib/gcode-parser.worker';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const GcodeScene = lazy(() => import('./gcode-scene').then((mod) => ({ default: mod.GcodeScene })));

type Status =
    | { kind: 'loading'; progress: number }
    | { kind: 'ready'; data: ParsedGcode }
    | { kind: 'error'; message: string };

export function GcodePreview({ printerId, file }: { printerId: string; file: GcodeFileDto }) {
    const [status, setStatus] = useState<Status>({ kind: 'loading', progress: 0 });
    const [layer, setLayer] = useState(0);
    const [follow, setFollow] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const printer = usePrinter(printerId);
    const live = printer?.live;
    const printingThis = Boolean(
        live && live.filename === file.filename && (live.printState === 'printing' || live.printState === 'paused'),
    );

    useEffect(() => {
        let cancelled = false;
        const worker = new Worker(new URL('../../../lib/gcode-parser.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
            if (cancelled) return;
            const msg = ev.data;
            if ('progress' in msg) setStatus({ kind: 'loading', progress: msg.progress });
            else if (msg.ok) {
                setStatus({ kind: 'ready', data: msg.data });
                setLayer(msg.data.layers.length);
            } else setStatus({ kind: 'error', message: msg.error });
        };
        if (file.filename.toLowerCase().endsWith('.bgcode')) {
            setStatus({ kind: 'error', message: m.preview_bgcode() });
        } else {
            fetch(api.files.downloadUrl(printerId, file.id), { credentials: 'include' })
                .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
                .then((text) => {
                    if (!cancelled) worker.postMessage({ text });
                })
                .catch((e: Error) => {
                    if (!cancelled) setStatus({ kind: 'error', message: e.message });
                });
        }
        return () => {
            cancelled = true;
            worker.terminate();
        };
    }, [printerId, file.id, file.filename]);

    useEffect(() => {
        if (printingThis && status.kind === 'ready') setFollow(true);
    }, [printingThis, status.kind]);

    const total = status.kind === 'ready' ? status.data.layers.length : 0;
    const shown = follow && printingThis && live ? Math.max(1, Math.min(total, live.currLayer)) : layer;

    return (
        <div className="grid gap-3 py-2">
            <div className="relative h-[55svh] w-full overflow-hidden rounded-2xl bg-secondary">
                {status.kind === 'ready' && (
                    <Suspense fallback={null}>
                        <GcodeScene data={status.data} shown={shown} resetSignal={resetSignal} />
                    </Suspense>
                )}
                {status.kind !== 'ready' && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        {status.kind === 'loading'
                            ? m.preview_parsing({ pct: Math.round(status.progress * 100) })
                            : status.message}
                    </div>
                )}
                {status.kind === 'ready' && (
                    <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                        <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="rounded-full shadow"
                            title={m.preview_reset_view()}
                            aria-label={m.preview_reset_view()}
                            onClick={() => setResetSignal((v) => v + 1)}
                        >
                            <RotateCcw />
                        </Button>
                        <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-xs">
                            {m.preview_orbit_hint()}
                        </span>
                    </div>
                )}
            </div>
            {status.kind === 'ready' && (
                <div className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-sm tabular-nums text-muted-foreground">
                        {m.preview_layer({
                            n: shown,
                            total,
                            z: status.data.layers[Math.max(0, shown - 1)]?.z.toFixed(2) ?? '0',
                        })}
                    </span>
                    <Slider
                        value={[shown]}
                        min={1}
                        max={Math.max(1, total)}
                        step={1}
                        disabled={follow && printingThis}
                        onValueChange={([v]) => setLayer(v)}
                        className="flex-1"
                    />
                    {printingThis && (
                        <span
                            className={cn(
                                'flex items-center gap-2 text-xs',
                                follow ? 'text-foreground' : 'text-muted-foreground',
                            )}
                        >
                            <Crosshair className="size-3.5" />
                            {m.preview_follow()}
                            <Switch checked={follow} onCheckedChange={setFollow} aria-label={m.preview_follow()} />
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
