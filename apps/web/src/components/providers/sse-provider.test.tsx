import type { KobralinkEvent } from '@kobralink/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import type { SseHandler, SseMultiplexer } from '@/lib/sse-multiplexer';
import { SseProvider } from './sse-provider';

const { toast } = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api', () => ({
    api: new Proxy({} as Record<string, unknown>, {
        get: () => new Proxy({}, { get: () => vi.fn().mockResolvedValue({ notifications: { browser: false } }) }),
    }),
}));

function fakeClient() {
    const handlers = new Map<string, SseHandler>();
    const client = {
        subscribe: (_channel: string, event: string, handler: SseHandler) => {
            handlers.set(event, handler);
            return () => handlers.delete(event);
        },
        onStatus: () => () => undefined,
        getStatus: () => 'open',
        disconnect: vi.fn(),
    } as unknown as SseMultiplexer;
    return { client, emit: (event: string, data: unknown) => act(() => handlers.get(event)?.(data)) };
}

const event = (type: KobralinkEvent['type'], id = 'e1'): KobralinkEvent => ({
    id,
    type,
    printerId: 'p1',
    printerName: 'Kobra',
    title: `title ${type}`,
    body: 'body',
    ts: 1,
});

function setup(onOpen?: (path: string) => void) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
    const { client, emit } = fakeClient();
    render(
        <QueryClientProvider client={qc}>
            <SseProvider client={client} onOpen={onOpen}>
                <span />
            </SseProvider>
        </QueryClientProvider>,
    );
    const keys = () => invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    return { qc, emit, keys, invalidate };
}

beforeEach(() => {
    toast.info.mockReset();
    toast.warning.mockReset();
});

describe('SseProvider notifications', () => {
    it('refreshes the queue, schedule, history and maintenance after a scheduled print event', async () => {
        const h = setup();
        await h.emit('notification', event('scheduled_print'));
        expect(h.keys()).toEqual(
            expect.arrayContaining([
                JSON.stringify(['printers', 'p1', 'queue']),
                JSON.stringify(['printers', 'p1', 'queue-status']),
                JSON.stringify(['printers', 'p1', 'schedule']),
                JSON.stringify(['printers', 'p1', 'history']),
                JSON.stringify(['history']),
                JSON.stringify(['printers', 'p1', 'maintenance']),
                JSON.stringify(['timelapses']),
            ]),
        );
        expect(toast.info).toHaveBeenCalledWith(
            'title scheduled_print',
            expect.objectContaining({ description: 'body' }),
        );
    });

    it('refreshes only the maintenance list after a maintenance due event', async () => {
        const h = setup();
        await h.emit('notification', event('maintenance_due'));
        expect(h.keys()).toEqual([JSON.stringify(['printers', 'p1', 'maintenance'])]);
    });

    it('does the same for the queue hold and print end events', async () => {
        const h = setup();
        await h.emit('notification', event('queue_next'));
        await h.emit('notification', event('print_finished', 'e2'));
        await h.emit('notification', event('print_cancelled', 'e3'));
        expect(h.keys().filter((k) => k === JSON.stringify(['printers', 'p1', 'queue-status']))).toHaveLength(3);
    });

    it('leaves the caches alone for other events and warns on alerts', async () => {
        const h = setup();
        await h.emit('notification', event('print_started'));
        expect(h.keys()).toEqual([]);
        await h.emit('notification', event('alert_print_failure', 'e2'));
        expect(toast.warning).toHaveBeenCalledOnce();
        expect(h.qc.getQueryData<KobralinkEvent[]>(['notifications'])?.map((e) => e.id)).toEqual(['e1', 'e2']);
    });

    it('refreshes the single queue when an item is held for filament', async () => {
        const h = setup();
        await h.emit('notification', event('queue_filament'));
        expect(h.keys()).toEqual(expect.arrayContaining([JSON.stringify(['queue'])]));
    });

    it('opens the screen of the event from the toast', async () => {
        const onOpen = vi.fn();
        const h = setup(onOpen);
        await h.emit('notification', event('queue_next'));
        const options = toast.info.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
        expect(options.action.label).toBe(m.notify_open_link());
        options.action.onClick();
        expect(onOpen).toHaveBeenCalledWith('/queue');
        await h.emit('notification', event('print_finished', 'e2'));
        (toast.info.mock.calls[1][1] as { action: { onClick: () => void } }).action.onClick();
        expect(onOpen).toHaveBeenLastCalledWith('/printers/p1');
    });

    it('offers no link without a way to open it', async () => {
        const h = setup();
        await h.emit('notification', event('queue_next'));
        expect(toast.info.mock.calls[0][1]).not.toHaveProperty('action');
    });
});
