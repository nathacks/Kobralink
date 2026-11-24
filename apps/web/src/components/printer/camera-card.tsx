import { useQuery } from '@tanstack/react-query';
import { Camera, CameraOff, Loader2, Maximize2, Minimize2, RotateCcw, ScanEye } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/components/printer/panel';
import { Button } from '@/components/ui/button';
import { type CameraPhase, useCameraStream } from '@/hooks/use-camera-stream';
import { m } from '@/lib/i18n';
import { printerDetectionQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const PHASE_LABEL: Record<CameraPhase, () => string> = {
    off: m.camera_stopped,
    starting: m.camera_connecting,
    live: m.camera_live,
    error: m.camera_unavailable,
};

const PHASE_HINT: Record<Exclude<CameraPhase, 'live'>, () => string> = {
    off: m.camera_click_start,
    starting: m.camera_starting,
    error: m.camera_cannot_read,
};

export function CameraCard({ printerId, className }: { printerId: string; className?: string }) {
    const { phase, src, offline, noCamera, printing, start, reset, turnOff, onStreamLoad, onStreamError } =
        useCameraStream(printerId);
    const detection = useQuery(printerDetectionQuery(printerId, printing)).data;
    const watching = printing && Boolean(detection?.active);
    const [fullscreen, setFullscreen] = useState(false);
    const [ratio, setRatio] = useState(16 / 9);
    const expanded = fullscreen && phase === 'live';

    const renderFeed = (layoutDependency: boolean | string) => (
        <div className="@container-size absolute inset-0 flex items-center justify-center">
            <motion.div
                layoutId={`camera-${printerId}`}
                layoutDependency={layoutDependency}
                className={cn('relative overflow-hidden', phase !== 'live' && 'invisible')}
                style={{ aspectRatio: ratio, width: `min(100cqw, ${100 * ratio}cqh)` }}
            >
                <img
                    src={src}
                    alt={m.camera_alt()}
                    className="size-full"
                    onLoad={(e) => {
                        const { naturalWidth, naturalHeight } = e.currentTarget;
                        if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
                        onStreamLoad();
                    }}
                    onError={onStreamError}
                />
                {watching &&
                    detection?.boxes.map((b) => (
                        <div
                            key={`${b.x}-${b.y}-${b.w}`}
                            className="pointer-events-none absolute rounded-md border-2 border-destructive"
                            style={{
                                left: `${b.x * 100}%`,
                                top: `${b.y * 100}%`,
                                width: `${b.w * 100}%`,
                                height: `${b.h * 100}%`,
                                opacity: Math.min(1, 0.3 + b.confidence),
                            }}
                        />
                    ))}
            </motion.div>
        </div>
    );

    return (
        <MotionConfig reducedMotion="user">
            <DialogPrimitive.Root open={expanded} onOpenChange={setFullscreen}>
                <section
                    className={cn(
                        'flex min-w-0 flex-col overflow-hidden rounded-3xl bg-card text-card-foreground',
                        className,
                    )}
                >
                    <div className="flex min-h-9 flex-wrap items-center justify-between gap-3 p-5 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                            <DialogPrimitive.Trigger asChild>
                                <IconButton title={m.camera_fullscreen()} disabled={phase !== 'live'}>
                                    <Maximize2 />
                                </IconButton>
                            </DialogPrimitive.Trigger>
                            <div className="min-w-0">
                                <h2 className="text-lg font-medium leading-tight">{m.camera_title()}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {noCamera ? m.camera_not_connected() : PHASE_LABEL[phase]()}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {watching && detection && (
                                <span
                                    className={cn(
                                        'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
                                        detection.failing
                                            ? 'bg-destructive text-white'
                                            : 'bg-secondary text-muted-foreground',
                                    )}
                                    title={m.detection_live_score({
                                        score: Math.round(detection.score * 100),
                                        frames: detection.frames,
                                        ms: detection.lastInferenceMs,
                                    })}
                                >
                                    <ScanEye className="size-3.5" />
                                    {detection.failing
                                        ? m.detection_badge_failing()
                                        : `${m.detection_badge_watching()} ${Math.round(detection.score * 100)} %`}
                                </span>
                            )}
                            {phase !== 'off' && (
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="rounded-full"
                                    title={m.camera_restart()}
                                    onClick={() => reset.mutate()}
                                    disabled={reset.isPending}
                                >
                                    <RotateCcw />
                                </Button>
                            )}
                            {phase === 'off' || phase === 'error' ? (
                                <Button
                                    className="rounded-full"
                                    onClick={() => start.mutate()}
                                    disabled={offline || start.isPending}
                                >
                                    <Camera /> {m.common_start()}
                                </Button>
                            ) : (
                                <Button variant="secondary" className="rounded-full" onClick={turnOff}>
                                    <CameraOff /> {m.common_stop()}
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="relative aspect-video max-h-[70svh] w-full flex-1 bg-muted">
                        {src && renderFeed(expanded)}
                        {phase !== 'live' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                {phase === 'starting' ? (
                                    <Loader2 className="size-8 animate-spin" />
                                ) : (
                                    <CameraOff className="size-8" />
                                )}
                                <span className="text-sm">
                                    {phase === 'off' && offline ? m.common_printer_offline() : PHASE_HINT[phase]()}
                                </span>
                            </div>
                        )}
                    </div>
                    {createPortal(
                        <AnimatePresence>
                            {expanded && (
                                <>
                                    <DialogPrimitive.Overlay forceMount asChild>
                                        <motion.div
                                            className="fixed inset-0 z-50 bg-black"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                        />
                                    </DialogPrimitive.Overlay>
                                    <DialogPrimitive.Content forceMount asChild aria-describedby={undefined}>
                                        <motion.div layoutRoot className="fixed inset-0 z-50 outline-none">
                                            <DialogPrimitive.Title className="sr-only">
                                                {m.camera_title()}
                                            </DialogPrimitive.Title>
                                            {renderFeed('fullscreen')}
                                            <DialogPrimitive.Close asChild>
                                                <IconButton
                                                    title={m.camera_fullscreen_exit()}
                                                    className="absolute top-(--inset-top) left-4"
                                                >
                                                    <Minimize2 />
                                                </IconButton>
                                            </DialogPrimitive.Close>
                                        </motion.div>
                                    </DialogPrimitive.Content>
                                </>
                            )}
                        </AnimatePresence>,
                        document.body,
                    )}
                </section>
            </DialogPrimitive.Root>
        </MotionConfig>
    );
}
