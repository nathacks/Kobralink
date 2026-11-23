import type { PrinterLiveState, QueueItemDto } from '@kobralink/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { QueueCard } from './queue-card';

const { item, other, queue, schedule, printer } = vi.hoisted(() => {
    const item: QueueItemDto = {
        id: 'q1',
        printerId: 'p1',
        targetTags: [],
        fileId: 'f1',
        filename: 'bracket.gcode',
        thumbnail: null,
        estPrintTimeSec: 600,
        position: 1,
        excludedObjects: [],
        options: {},
        createdAt: '2026-10-01T00:00:00.000Z',
        waiting: 'manual',
        candidates: ['p1'],
    };
    const other: QueueItemDto = { ...item, id: 'q9', printerId: null, filename: 'other.gcode', position: 2 };
    return {
        item,
        other,
        queue: {
            list: vi.fn(),
            all: vi.fn(),
            status: vi.fn(),
            bedClear: vi.fn(),
            start: vi.fn(),
            remove: vi.fn(),
            clear: vi.fn(),
            reorder: vi.fn(),
            maintenance: vi.fn(),
            cancelAutoStart: vi.fn(),
        },
        schedule: { list: vi.fn(), remove: vi.fn() },
        printer: {
            settings: {
                queueAutoStart: true,
                queueBedClearConfirm: true,
                queueAutoStartDelaySec: 15,
                lightTrigger: false,
            },
        },
    };
});

vi.mock('@/lib/api', () => ({
    api: new Proxy({ queue, schedule } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));

vi.mock('@/hooks/use-printers', () => ({
    useLiveState: () => ({ connected: true, printState: 'standby', kobraState: 'free' }) as PrinterLiveState,
    usePrinter: () => printer,
    usePrinters: () => [{ id: 'p1', name: 'Kobra 4' }],
}));

const scheduled = {
    id: 's1',
    printerId: 'p1',
    fileId: 'f2',
    filename: 'lid.gcode',
    thumbnail: null,
    estPrintTimeSec: 300,
    startAt: '2026-10-29T08:00:00.000Z',
    excludedObjects: [],
    createdAt: '2026-10-28T00:00:00.000Z',
};

const status = (over = {}) => ({ awaitingBedClear: false, maintenance: false, nextFilename: 'bracket.gcode', ...over });

beforeEach(() => {
    queue.list.mockReset().mockResolvedValue([item, { ...item, id: 'q2', filename: 'lid2.gcode', position: 3 }]);
    queue.all.mockReset().mockResolvedValue([item, other, { ...item, id: 'q2', position: 3 }]);
    queue.status.mockReset().mockResolvedValue(status({ awaitingBedClear: true }));
    queue.bedClear.mockReset().mockResolvedValue({ started: { filename: 'bracket.gcode' } });
    queue.start.mockReset().mockResolvedValue({ filename: 'bracket.gcode' });
    queue.remove.mockReset().mockResolvedValue(undefined);
    queue.reorder.mockReset().mockResolvedValue([]);
    queue.clear.mockReset().mockResolvedValue(undefined);
    queue.maintenance.mockReset().mockResolvedValue(status({ maintenance: true }));
    schedule.list.mockReset().mockResolvedValue([scheduled]);
    schedule.remove.mockReset().mockResolvedValue(undefined);
    printer.settings = {
        queueAutoStart: true,
        queueBedClearConfirm: true,
        queueAutoStartDelaySec: 15,
        lightTrigger: false,
    };
});

describe('QueueCard', () => {
    it('asks to rate the cleared bed, good or bad', async () => {
        await renderWithProviders(<QueueCard printerId="p1" />);
        expect(await screen.findByText(m.queue_bed_waiting())).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_bed_good()) }));
        expect(queue.bedClear).toHaveBeenCalledWith('p1', 'good');
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_bed_bad()) }));
        expect(queue.bedClear).toHaveBeenLastCalledWith('p1', 'bad');
    });

    it('shows each item with its target and why it waits', async () => {
        queue.status.mockResolvedValue(status());
        await renderWithProviders(<QueueCard printerId="p1" />);
        expect(await screen.findByText('bracket.gcode')).toBeTruthy();
        expect(screen.getAllByText('· Kobra 4')).toHaveLength(2);
        expect(screen.getAllByText(m.queue_waiting_manual())).toHaveLength(2);
        expect(screen.queryByText(m.queue_bed_waiting())).toBeNull();
    });

    it('moves an item within the single queue order', async () => {
        queue.status.mockResolvedValue(status());
        await renderWithProviders(<QueueCard printerId="p1" />);
        await screen.findByText('bracket.gcode');
        await waitFor(() => expect(queue.all).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        await userEvent.click(screen.getAllByRole('button', { name: m.queue_move_down() })[0]);
        expect(queue.reorder).toHaveBeenCalledWith(['q2', 'q9', 'q1']);
    });

    it('puts the printer in maintenance and explains it', async () => {
        queue.status.mockResolvedValue(status());
        await renderWithProviders(<QueueCard printerId="p1" />);
        await screen.findByText('bracket.gcode');
        queue.status.mockResolvedValue(status({ maintenance: true }));
        await userEvent.click(screen.getByRole('button', { name: m.queue_maintenance() }));
        expect(queue.maintenance).toHaveBeenCalledWith('p1', true);
        expect(await screen.findByText(m.queue_maintenance_hint())).toBeTruthy();
    });

    it('explains the auto-start mode from the printer settings', async () => {
        printer.settings = {
            queueAutoStart: true,
            queueBedClearConfirm: false,
            queueAutoStartDelaySec: 15,
            lightTrigger: false,
        };
        await renderWithProviders(<QueueCard printerId="p1" />);
        expect(await screen.findByText(m.queue_mode_auto({ when: m.queue_when_after({ seconds: 15 }) }))).toBeTruthy();
        printer.settings = {
            queueAutoStart: false,
            queueBedClearConfirm: true,
            queueAutoStartDelaySec: 15,
            lightTrigger: false,
        };
    });

    it('counts down to an automatic start and cancels it', async () => {
        const at = new Date(Date.now() + 12_400).toISOString();
        queue.status.mockResolvedValue(status({ autoStartAt: at }));
        queue.cancelAutoStart.mockResolvedValue(status());
        await renderWithProviders(<QueueCard printerId="p1" />);
        expect(await screen.findByText(m.queue_starts_in({ seconds: 13 }))).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.queue_cancel_start() }));
        expect(queue.cancelAutoStart).toHaveBeenCalledWith('p1');
        await waitFor(() => expect(screen.queryByText(/13 s/)).toBeNull());
    });

    it('removes a scheduled print and a queued one, and clears the printer queue', async () => {
        await renderWithProviders(<QueueCard printerId="p1" />);
        await screen.findByText(/lid\.gcode/);
        await userEvent.click(screen.getAllByRole('button', { name: m.common_delete() })[0]);
        expect(schedule.remove).toHaveBeenCalledWith('p1', 's1');
        await userEvent.click(screen.getAllByRole('button', { name: m.common_delete() })[1]);
        expect(queue.remove).toHaveBeenCalledWith('q1');
    });

    it('shows the empty state and starts the next file by hand', async () => {
        queue.list.mockResolvedValue([]);
        schedule.list.mockResolvedValue([]);
        queue.status.mockResolvedValue(status());
        const empty = await renderWithProviders(<QueueCard printerId="p1" />);
        expect(await screen.findByText(m.queue_empty())).toBeTruthy();
        empty.unmount();
        queue.list.mockResolvedValue([item]);
        await renderWithProviders(<QueueCard printerId="p1" />);
        await screen.findByText('bracket.gcode');
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_start_next()) }));
        expect(queue.start).toHaveBeenCalledWith('p1');
    });
});
