import type { PrinterLiveState } from '@kobralink/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { printersStore } from '@/stores/printers';

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
            printersStore.actions.setLiveState(printerId, state);
        });
        return () => es.close();
    }, [printerId, qc]);
}
