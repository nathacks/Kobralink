import type { GcodeFileDto } from '@kobralink/shared';
import { lazy, Suspense, useState } from 'react';
import { SceneOverlay } from '@/components/printer/files/gcode-preview';
import type { SceneMode } from '@/components/printer/files/gcode-scene';
import { useParsedGcode } from '@/hooks/use-parsed-gcode';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const GcodeScene = lazy(() => import('./gcode-scene').then((mod) => ({ default: mod.GcodeScene })));

export function PrintPreview3D({
    printerId,
    file,
    tint,
    className,
}: {
    printerId: string;
    file: GcodeFileDto;
    tint?: string;
    className?: string;
}) {
    const status = useParsedGcode(printerId, file);
    const [mode, setMode] = useState<SceneMode>('solid');
    const [pan, setPan] = useState(false);
    const [resetSignal, setResetSignal] = useState(0);
    const thumbnail = file.thumbnail ? (
        <img src={`data:image/png;base64,${file.thumbnail}`} alt="" className="size-full object-contain p-6" />
    ) : null;

    return (
        <div className={cn('relative overflow-hidden rounded-2xl bg-secondary', className)}>
            {status.kind === 'ready' ? (
                <>
                    <Suspense fallback={thumbnail}>
                        <GcodeScene
                            data={status.data}
                            shown={status.data.layers.length}
                            mode={mode}
                            pan={pan}
                            resetSignal={resetSignal}
                            tint={tint}
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
                <>
                    {thumbnail}
                    <span className="absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">
                        {status.kind === 'loading'
                            ? m.preview_parsing({ pct: Math.round(status.progress * 100) })
                            : status.message}
                    </span>
                </>
            )}
        </div>
    );
}
