import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLiveState, usePrinter } from '@/hooks/use-printers';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';

export type CameraPhase = 'off' | 'starting' | 'live' | 'error';

export function useCameraStream(printerId: string) {
    const { offline, noCamera, printing } = useLiveState(printerId, (s) => ({
        offline: !s.connected,
        noCamera: s.peripherals?.camera === false,
        printing: s.printState === 'printing',
    }));
    const { cameraOnPrint, cameraAlwaysOn } = usePrinter(printerId, (p) => ({
        cameraOnPrint: p?.settings.cameraOnPrint ?? false,
        cameraAlwaysOn: p?.settings.cameraAlwaysOn ?? true,
    }));
    const [phase, setPhase] = useState<CameraPhase>('off');
    const [src, setSrc] = useState('');
    const [userStopped, setUserStopped] = useState(false);
    const openStream = () => setSrc(`${api.camera.streamUrl(printerId)}?t=${Date.now()}`);

    const start = useMutation({
        mutationFn: () => api.camera.start(printerId),
        onMutate: () => setPhase('starting'),
        onSuccess: openStream,
        onError: (e) => {
            setPhase('error');
            toast.error(e.message);
        },
    });
    const stop = useMutation({
        mutationFn: () => api.camera.stop(printerId),
    });
    const reset = useMutation({
        mutationFn: () => api.camera.reset(printerId),
        onSuccess: () => {
            setPhase('starting');
            openStream();
        },
    });

    useEffect(() => {
        if (!printing) setUserStopped(false);
    }, [printing]);

    const autostart =
        (cameraAlwaysOn || (printing && cameraOnPrint)) && phase === 'off' && !offline && !noCamera && !userStopped;
    useEffect(() => {
        if (autostart && !start.isPending) start.mutate();
    }, [autostart, start]);

    return {
        phase,
        src,
        offline,
        noCamera,
        printing,
        start,
        reset,
        turnOff: () => {
            setUserStopped(true);
            setSrc('');
            setPhase('off');
            stop.mutate();
        },
        onStreamLoad: () => setPhase('live'),
        onStreamError: () => {
            setSrc('');
            setPhase('error');
            toast.error(m.camera_stream_unavailable());
        },
    };
}
