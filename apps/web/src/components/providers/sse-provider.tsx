import {
    eventLinkPath,
    type KobralinkEvent,
    type PrinterLiveState,
    type SseChannel,
    type SseParams,
} from '@kobralink/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { m } from '@/lib/i18n';
import { printerErrorText } from '@/lib/labels';
import { appSettingsQuery, printerQuery } from '@/lib/queries';
import { type SseHandler, type SseMultiplexer, type SseStatus, sseMultiplexer } from '@/lib/sse-multiplexer';
import { printersStore } from '@/stores/printers';

const SseContext = createContext<SseMultiplexer>(sseMultiplexer);

export function useSseClient(): SseMultiplexer {
    return useContext(SseContext);
}

export function useSse<T = unknown>(
    channel: SseChannel,
    event: string,
    handler: SseHandler<T>,
    params?: SseParams,
    enabled = true,
): void {
    const client = useSseClient();
    const ref = useRef(handler);
    ref.current = handler;
    const paramsKey = JSON.stringify(params ?? null);
    useEffect(() => {
        if (!enabled) return;
        const p = paramsKey === 'null' ? undefined : (JSON.parse(paramsKey) as SseParams);
        return client.subscribe<T>(channel, event, (data) => ref.current(data), p);
    }, [client, channel, event, paramsKey, enabled]);
}

export function useSseStatus(): SseStatus {
    const client = useSseClient();
    const [status, setStatus] = useState<SseStatus>(client.getStatus());
    useEffect(() => client.onStatus(setStatus), [client]);
    return status;
}

const desktop = (): { setTrayStatus?: (p: unknown[]) => void } | undefined =>
    (window as unknown as { kobralinkDesktop?: { setTrayStatus?: (p: unknown[]) => void } }).kobralinkDesktop;

interface RefusedPayload {
    printerId: string;
    printerName: string;
    topic: string;
    action: string;
    code: string | number;
    msg: string;
}

function GlobalSubscriptions({ onOpen }: { onOpen?: (path: string) => void }) {
    const qc = useQueryClient();
    const settings = useQuery(appSettingsQuery);
    const browser = settings.data?.notifications.browser ?? true;
    const browserRef = useRef(browser);
    browserRef.current = browser;

    const discovering = useRef(new Set<string>());
    useSse<{ printerId: string; state: PrinterLiveState }>('printers', 'state', ({ printerId, state }) => {
        if (printersStore.state.printers[printerId]) {
            printersStore.actions.setLiveState(printerId, state);
            return;
        }
        if (discovering.current.has(printerId)) return;
        discovering.current.add(printerId);
        qc.fetchQuery(printerQuery(printerId))
            .then((printer) => {
                printersStore.actions.upsertPrinter(printer);
                void qc.invalidateQueries({ queryKey: ['printers'], exact: true });
            })
            .catch(() => {})
            .finally(() => discovering.current.delete(printerId));
    });

    useSse<KobralinkEvent>('printers', 'notification', (event) => {
        qc.setQueryData<KobralinkEvent[]>(['notifications'], (old) => [...(old ?? []), event].slice(-200));
        if (
            event.type === 'queue_next' ||
            event.type === 'queue_filament' ||
            event.type === 'print_finished' ||
            event.type === 'print_cancelled' ||
            event.type === 'scheduled_print'
        ) {
            void qc.invalidateQueries({ queryKey: ['queue'] });
            void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'queue'] });
            void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'queue-status'] });
            void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'schedule'] });
            void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'history'] });
            void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'maintenance'] });
            void qc.invalidateQueries({ queryKey: ['timelapses'] });
        }
        if (event.type === 'maintenance_due') {
            void qc.invalidateQueries({ queryKey: ['printers', event.printerId, 'maintenance'] });
        }
        const alert = event.type.startsWith('alert') || event.type === 'print_paused';
        const path = eventLinkPath(event.type, event.printerId);
        (alert ? toast.warning : toast.info)(event.title, {
            description: event.body,
            duration: 8000,
            ...(onOpen ? { action: { label: m.notify_open_link(), onClick: () => onOpen(path) } } : {}),
        });
        if (
            browserRef.current &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            document.hidden
        ) {
            try {
                const shown = new Notification(event.title, { body: event.body, tag: event.id });
                shown.onclick = () => {
                    window.focus();
                    onOpen?.(path);
                    shown.close();
                };
            } catch {}
        }
    });

    useSse<{ level: string; context: string; message: string }>('printers', 'log', (entry) => {
        toast.error(entry.message, { description: entry.context, duration: 8000 });
    });

    useSse<RefusedPayload>('printers', 'refused', (r) => {
        toast.error(
            m.toast_command_refused({
                command: `${r.topic}/${r.action}`,
                code: r.code,
                msg: printerErrorText(r.code, r.msg),
            }),
            {
                id: `refused:${r.printerId}:${r.topic}:${r.action}`,
                description: r.printerName,
                duration: 8000,
            },
        );
    });

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

    return null;
}

export function SseProvider({
    children,
    client = sseMultiplexer,
    onOpen,
}: {
    children: ReactNode;
    client?: SseMultiplexer;
    onOpen?: (path: string) => void;
}) {
    useEffect(() => () => client.disconnect(), [client]);
    return (
        <SseContext.Provider value={client}>
            <GlobalSubscriptions onOpen={onOpen} />
            {children}
        </SseContext.Provider>
    );
}
