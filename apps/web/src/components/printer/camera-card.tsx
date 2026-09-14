import { useMutation } from '@tanstack/react-query';
import { Camera, CameraOff, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useLiveState, usePrinter } from '@/stores/printers';

type Phase = 'off' | 'starting' | 'live' | 'error';

export function CameraCard({ printerId }: { printerId: string }) {
    const state = useLiveState(printerId);
    const cameraOnPrint = usePrinter(printerId)?.settings.cameraOnPrint ?? false;
    const [phase, setPhase] = useState<Phase>('off');
    const [src, setSrc] = useState('');
    const userStopped = useRef(false);
    const printing = state.printState === 'printing';
    const offline = !state.connected;

    const start = useMutation({
        mutationFn: () => api.camera.start(printerId),
        onMutate: () => setPhase('starting'),
        onSuccess: () => {
            setSrc(`${api.camera.streamUrl(printerId)}?t=${Date.now()}`);
        },
        onError: (e) => {
            setPhase('error');
            toast.error(e.message);
        },
    });
    const stop = useMutation({
        mutationFn: () => api.camera.stop(printerId),
        onError: (e) => toast.error(e.message),
    });
    const reset = useMutation({
        mutationFn: () => api.camera.reset(printerId),
        onSuccess: () => {
            setPhase('starting');
            setSrc(`${api.camera.streamUrl(printerId)}?t=${Date.now()}`);
        },
        onError: (e) => toast.error(e.message),
    });

    const turnOff = () => {
        userStopped.current = true;
        setSrc('');
        setPhase('off');
        stop.mutate();
    };

    useEffect(() => {
        if (!printing) userStopped.current = false;
    }, [printing]);

    const autostart = printing && cameraOnPrint && phase === 'off' && !offline && !userStopped.current;
    useEffect(() => {
        if (autostart && !start.isPending) start.mutate();
    }, [autostart, start]);

    useEffect(() => () => setSrc(''), []);

    return (
        <section className="flex flex-col overflow-hidden border border-card rounded-3xl bg-card text-card-foreground">
            <div className="flex items-center justify-between gap-3 p-6 pb-3">
                <div>
                    <h2 className="text-lg font-medium">{m.camera_title()}</h2>
                    <p className="text-sm text-muted-foreground">
                        {phase === 'live'
                            ? m.camera_live()
                            : phase === 'starting'
                              ? m.camera_connecting()
                              : phase === 'error'
                                ? m.camera_unavailable()
                                : m.camera_stopped()}
                    </p>
                </div>
                <div className="flex gap-2">
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
            <div className="relative min-h-0 w-full flex-1 bg-black/40 aspect-video">
                {src && (
                    <img
                        src={src}
                        alt={m.camera_alt()}
                        className={cn('size-full object-contain', phase !== 'live' && 'invisible')}
                        onLoad={() => setPhase('live')}
                        onError={() => {
                            setSrc('');
                            setPhase('error');
                            toast.error(m.camera_stream_unavailable());
                        }}
                    />
                )}
                {phase !== 'live' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        {phase === 'starting' ? (
                            <Loader2 className="size-8 animate-spin" />
                        ) : (
                            <CameraOff className="size-8" />
                        )}
                        <span className="text-sm">
                            {phase === 'starting'
                                ? m.camera_starting()
                                : phase === 'error'
                                  ? m.camera_cannot_read()
                                  : offline
                                    ? m.common_printer_offline()
                                    : m.camera_click_start()}
                        </span>
                    </div>
                )}
            </div>
        </section>
    );
}
