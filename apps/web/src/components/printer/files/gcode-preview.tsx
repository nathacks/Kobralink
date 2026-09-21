import type { GcodeFileDto } from '@kobralink/shared';
import { Box, Crosshair, Move, RotateCcw } from 'lucide-react';
import { type ComponentProps, lazy, Suspense, useEffect, useState } from 'react';
import type { SceneMode } from '@/components/printer/files/gcode-scene';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useParsedGcode } from '@/hooks/use-parsed-gcode';
import { usePrinter } from '@/hooks/use-printers';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const GcodeScene = lazy(() => import('./gcode-scene').then((mod) => ({ default: mod.GcodeScene })));

export function GcodePreview({ printerId, file }: { printerId: string; file: GcodeFileDto }) {
    const status = useParsedGcode(printerId, file);
    const [layer, setLayer] = useState(0);
    const [follow, setFollow] = useState(false);
    const [mode, setMode] = useState<SceneMode>('lines');
    const [pan, setPan] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const live = usePrinter(printerId)?.live;
    const printingThis = Boolean(
        live && live.filename === file.filename && (live.printState === 'printing' || live.printState === 'paused'),
    );
    const data = status.kind === 'ready' ? status.data : null;
    const total = data?.layers.length ?? 0;

    useEffect(() => {
        if (data) setLayer(data.layers.length);
    }, [data]);

    useEffect(() => {
        if (printingThis && data) setFollow(true);
    }, [printingThis, data]);

    const following = follow && printingThis;
    const shown = following && live ? Math.max(1, Math.min(total, live.currLayer)) : layer;

    return (
        <div className="grid gap-3 py-2">
            <div className="relative h-[55svh] w-full overflow-hidden rounded-2xl bg-secondary">
                {status.kind === 'ready' ? (
                    <>
                        <Suspense fallback={null}>
                            <GcodeScene
                                data={status.data}
                                shown={shown}
                                mode={mode}
                                pan={pan}
                                resetSignal={resetSignal}
                            />
                        </Suspense>
                        <SceneOverlay
                            mode={mode}
                            pan={pan}
                            onToggleMode={() => setMode((v) => (v === 'solid' ? 'lines' : 'solid'))}
                            onTogglePan={() => setPan((v) => !v)}
                            onReset={() => setResetSignal((v) => v + 1)}
                        />
                    </>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        {status.kind === 'loading'
                            ? m.preview_parsing({ pct: Math.round(status.progress * 100) })
                            : status.message}
                    </div>
                )}
            </div>
            {data && (
                <LayerControls
                    data={data}
                    shown={shown}
                    onChange={setLayer}
                    follow={printingThis ? { checked: follow, onChange: setFollow } : null}
                />
            )}
        </div>
    );
}

function SceneOverlay({
    mode,
    pan,
    onToggleMode,
    onTogglePan,
    onReset,
}: {
    mode: SceneMode;
    pan: boolean;
    onToggleMode: () => void;
    onTogglePan: () => void;
    onReset: () => void;
}) {
    return (
        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-xs">
                {pan ? m.preview_pan_hint() : m.preview_orbit_hint()}
            </span>
            <OverlayButton label={m.preview_reset_view()} onClick={onReset}>
                <RotateCcw />
            </OverlayButton>
            <OverlayButton
                label={m.preview_pan()}
                variant={pan ? 'default' : 'secondary'}
                aria-pressed={pan}
                onClick={onTogglePan}
            >
                <Move />
            </OverlayButton>
            <OverlayButton
                label={m.preview_solid()}
                variant={mode === 'solid' ? 'default' : 'secondary'}
                aria-pressed={mode === 'solid'}
                onClick={onToggleMode}
            >
                <Box />
            </OverlayButton>
        </div>
    );
}

function OverlayButton({ label, ...props }: { label: string } & ComponentProps<typeof Button>) {
    return (
        <Button
            type="button"
            size="icon"
            variant="secondary"
            className="rounded-full shadow"
            title={label}
            aria-label={label}
            {...props}
        />
    );
}

function LayerControls({
    data,
    shown,
    onChange,
    follow,
}: {
    data: ParsedGcode;
    shown: number;
    onChange: (layer: number) => void;
    follow: { checked: boolean; onChange: (v: boolean) => void } | null;
}) {
    const total = data.layers.length;
    return (
        <div className="flex items-center gap-4">
            <span className="flex w-28 shrink-0 flex-col text-sm tabular-nums leading-tight">
                <span>{m.preview_layer({ n: shown, total })}</span>
                <span className="text-xs text-muted-foreground">
                    {m.preview_layer_z({ z: data.layers[Math.max(0, shown - 1)]?.z.toFixed(2) ?? '0' })}
                </span>
            </span>
            <Slider
                value={[shown]}
                min={1}
                max={Math.max(1, total)}
                step={1}
                disabled={follow?.checked ?? false}
                onValueChange={([v]) => onChange(v)}
                className="flex-1"
            />
            {follow && (
                <span
                    className={cn(
                        'flex items-center gap-2 text-xs',
                        follow.checked ? 'text-foreground' : 'text-muted-foreground',
                    )}
                >
                    <Crosshair className="size-3.5" />
                    {m.preview_follow()}
                    <Switch
                        checked={follow.checked}
                        onCheckedChange={follow.onChange}
                        aria-label={m.preview_follow()}
                    />
                </span>
            )}
        </div>
    );
}
