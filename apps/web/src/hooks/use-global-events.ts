import type { KobralinkEvent, PrinterLiveState } from '@kobralink/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { appSettingsQuery } from '@/lib/queries';
import { printersStore } from '@/stores/printers';

const desktop = (): { setTrayStatus?: (p: unknown[]) => void } | undefined =>
    (window as unknown as { kobralinkDesktop?: { setTrayStatus?: (p: unknown[]) => void } }).kobralinkDesktop;

export function useGlobalEvents() {
    const qc = useQueryClient();
    const settings = useQuery(appSettingsQuery);
    const browser = settings.data?.notifications.browser ?? true;
    const browserRef = useRef(browser);
    browserRef.current = browser;

    useEffect(() => {
        const es = new EventSource('/kx/events', { withCredentials: true });
        es.addEventListener('state', (ev) => {
            let payload: { printerId: string; state: PrinterLiveState };
            try {
                payload = JSON.parse((ev as MessageEvent).data);
            } catch {
                return;
            }
            printersStore.actions.setLiveState(payload.printerId, payload.state);
            qc.setQueryData(['printers', payload.printerId, 'state'], payload.state);
        });
        es.addEventListener('notification', (ev) => {
            let event: KobralinkEvent;
            try {
                event = JSON.parse((ev as MessageEvent).data);
            } catch {
                return;
            }
            qc.setQueryData<KobralinkEvent[]>(['notifications'], (old) => [...(old ?? []), event].slice(-200));
            if (event.type === 'queue_next' || event.type === 'print_finished') {
                void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'queue'] });
                void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'history'] });
                void qc.invalidateQueries({ queryKey: ['timelapses'] });
            }
            const alert = event.type.startsWith('alert') || event.type === 'print_paused';
            (alert ? toast.warning : toast.info)(event.title, { description: event.body, duration: 8000 });
            if (
                browserRef.current &&
                'Notification' in window &&
                Notification.permission === 'granted' &&
                document.hidden
            ) {
                try {
                    new Notification(event.title, { body: event.body, tag: event.id });
                } catch {}
            }
        });
        return () => es.close();
    }, [qc]);

    useEffect(() => {
        const d = desktop();
        if (!d?.setTrayStatus) return;
        const push = () => {
            const s = printersStore.state;
            d.setTrayStatus?.(
                s.order
                    .map((id) => s.printers[id])
                    .filter(Boolean)
                    .map((p) => ({
                        id: p.id,
                        name: p.name,
                        connected: p.live?.connected ?? false,
                        printState: p.live?.printState ?? 'error',
                        progress: p.live?.progress ?? 0,
                        remainTimeSec: p.live?.remainTimeSec ?? 0,
                        filename: p.live?.filename ?? '',
                    })),
            );
        };
        push();
        const sub = printersStore.subscribe(push);
        return () => sub.unsubscribe();
    }, []);
}
