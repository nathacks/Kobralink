import type { PrinterLiveState } from '@kobralink/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export interface Sample {
    t: number;
    nozzle: number;
    bed: number;
    progress: number;
}

const MAX_SAMPLES = 60;

export function samplesKey(printerId: string) {
    return ['printers', printerId, 'samples'] as const;
}

export function useSamples(printerId: string): Sample[] {
    const q = useQuery({
        queryKey: samplesKey(printerId),
        queryFn: () => [] as Sample[],
        initialData: [] as Sample[],
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
    });
    return q.data;
}

export function usePrinterEvents(printerId: string | undefined) {
    const qc = useQueryClient();
    useEffect(() => {
        if (!printerId) return;
        const es = new EventSource(`/kx/printers/${printerId}/events`, { withCredentials: true });
        es.addEventListener('state', (ev) => {
            let state: PrinterLiveState;
            try {
                state = JSON.parse((ev as MessageEvent).data) as PrinterLiveState;
            } catch {
                return;
            }
            qc.setQueryData(['printers', printerId, 'state'], state);
            qc.setQueryData<Sample[]>(samplesKey(printerId), (old = []) => {
                const last = old[old.length - 1];
                if (last && state.updatedAt - last.t < 2000) return old;
                const next = [
                    ...old,
                    { t: state.updatedAt, nozzle: state.nozzleTemp, bed: state.bedTemp, progress: state.progress },
                ];
                return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
            });
        });
        return () => es.close();
    }, [printerId, qc]);
}
