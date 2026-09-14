import type { GcodeFileDto } from '@kobralink/shared';
import { Crosshair } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import type { ParsedGcode, WorkerResponse } from '@/lib/gcode-parser.worker';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Status =
    | { kind: 'loading'; progress: number }
    | { kind: 'ready'; data: ParsedGcode }
    | { kind: 'error'; message: string };

export function GcodePreview({ printerId, file }: { printerId: string; file: GcodeFileDto }) {
    const [status, setStatus] = useState<Status>({ kind: 'loading', progress: 0 });
    const [layer, setLayer] = useState(0);
    const [follow, setFollow] = useState(false);
    const printer = usePrinter(printerId);
    const live = printer?.live;
    const printingThis = Boolean(
        live && live.filename === file.filename && (live.printState === 'printing' || live.printState === 'paused'),
    );
    const canvasRef = useRef<HTMLCanvasElement>(null);

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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || status.kind !== 'ready') return;
        const draw = () => {
            const { layers, minX, maxX, minY, maxY } = status.data;
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const pad = 16;
            const spanX = Math.max(1, maxX - minX);
            const spanY = Math.max(1, maxY - minY);
            const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
            const ox = (w - spanX * scale) / 2 - minX * scale;
            const oy = (h + spanY * scale) / 2 + minY * scale;
            const tx = (x: number) => ox + x * scale;
            const ty = (y: number) => oy - y * scale;
            const style = getComputedStyle(canvas);
            const primary = style.getPropertyValue('--primary').trim() || '#10b981';
            const muted = style.getPropertyValue('--muted-foreground').trim() || '#888';
            const count = Math.min(shown, layers.length);
            const start = Math.max(0, count - 40);
            ctx.lineCap = 'round';
            for (let i = start; i < count; i++) {
                const l = layers[i];
                const last = i === count - 1;
                ctx.strokeStyle = last ? primary : muted;
                ctx.globalAlpha = last ? 1 : 0.08 + (0.5 * (i - start)) / Math.max(1, count - start);
                ctx.lineWidth = last ? 1.6 : 1;
                ctx.beginPath();
                const s = l.segs;
                for (let k = 0; k < s.length; k += 4) {
                    ctx.moveTo(tx(s[k]), ty(s[k + 1]));
                    ctx.lineTo(tx(s[k + 2]), ty(s[k + 3]));
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        };
        draw();
        const ro = new ResizeObserver(draw);
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [status, shown]);

    return (
        <div className="grid gap-3 py-2">
            <div className="relative h-[55svh] w-full overflow-hidden rounded-2xl bg-secondary">
                <canvas ref={canvasRef} className="size-full" />
                {status.kind !== 'ready' && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        {status.kind === 'loading'
                            ? m.preview_parsing({ pct: Math.round(status.progress * 100) })
                            : status.message}
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
