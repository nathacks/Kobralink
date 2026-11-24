import type { PrintJobDto, QueueItemDto } from '@kobralink/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import { FilesPage } from './files-page';
import { HistoryPage } from './history-page';
import { MaintenancePage } from './maintenance-page';
import { QueuePage } from './queue-page';

const { queue, schedule, files, state } = vi.hoisted(() => ({
    queue: {
        all: vi.fn(),
        reorder: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        bedClear: vi.fn(),
        status: vi.fn(),
        cancelAutoStart: vi.fn(),
    },
    schedule: { list: vi.fn(), remove: vi.fn() },
    files: { historyAll: vi.fn() },
    state: { printers: [] as unknown[] },
}));

vi.mock('@/lib/api', () => ({
    api: new Proxy({ queue, schedule, files } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue({}) }),
    }),
}));

vi.mock('@/hooks/use-printers', () => ({
    usePrinterList: () => state.printers,
    usePrinters: (select: (printers: unknown[]) => unknown) => select(state.printers),
}));

vi.mock('@/components/printer/files/files-card', () => ({
    FilesCard: ({ printerId }: { printerId: string }) => <div>files of {printerId}</div>,
}));

vi.mock('@/components/printer/maintenance-card', () => ({
    MaintenanceCard: ({ printerId }: { printerId: string }) => <div>tasks of {printerId}</div>,
}));

const live = (printState: string) => ({ connected: true, printState });

const kobra = { id: 'p1', name: 'Kobra 4', awaitingBedClear: true, live: live('standby') };
const kobraX = { id: 'p2', name: 'Kobra X', awaitingBedClear: false, live: live('printing') };

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
    waiting: 'bed_clear',
    candidates: ['p1'],
};

const job: PrintJobDto = {
    id: 'j1',
    printerId: 'p2',
    fileId: null,
    filename: 'lid.gcode',
    status: 'completed',
    startedAt: '2026-10-20T10:00:00.000Z',
    finishedAt: '2026-10-20T11:00:00.000Z',
    durationSec: 3600,
    estimatedSec: 0,
    filamentMm: 0,
    spoolUsage: [],
    thumbnail: null,
    errorCode: 0,
    errorMsg: '',
    failureReason: '',
    note: '',
    hasSnapshot: false,
    pausedAt: null,
    energyKwh: null,
    cost: null,
};

beforeEach(() => {
    state.printers = [kobra, kobraX] as unknown as PrinterWithLive[];
    queue.all.mockReset().mockResolvedValue([item, { ...item, id: 'q2', printerId: null, filename: 'clip.gcode' }]);
    queue.reorder.mockReset().mockResolvedValue([]);
    queue.remove.mockReset().mockResolvedValue(undefined);
    queue.clear.mockReset().mockResolvedValue(undefined);
    queue.bedClear.mockReset().mockResolvedValue({ started: null });
    queue.status
        .mockReset()
        .mockResolvedValue({ awaitingBedClear: false, maintenance: false, nextFilename: null, autoStartAt: null });
    queue.cancelAutoStart
        .mockReset()
        .mockResolvedValue({ awaitingBedClear: false, maintenance: false, nextFilename: null, autoStartAt: null });
    schedule.list.mockReset().mockImplementation(async (printerId: string) =>
        printerId === 'p2'
            ? [
                  {
                      id: 's1',
                      printerId: 'p2',
                      fileId: 'f2',
                      filename: 'night.gcode',
                      thumbnail: null,
                      estPrintTimeSec: 300,
                      startAt: '2026-10-31T02:00:00.000Z',
                      excludedObjects: [],
                      createdAt: '2026-10-30T00:00:00.000Z',
                  },
              ]
            : [],
    );
    schedule.remove.mockReset().mockResolvedValue(undefined);
    files.historyAll.mockReset().mockResolvedValue([job]);
    alertConfirmationDialogStore.actions.closeAlertDialog();
});

describe('QueuePage', () => {
    it('lists the single queue with each target and reorders it', async () => {
        await renderWithProviders(<QueuePage />);
        expect(await screen.findByText('bracket.gcode')).toBeTruthy();
        expect(screen.getByText('· Kobra 4')).toBeTruthy();
        expect(screen.getByText(`· ${m.queue_target_any()}`)).toBeTruthy();
        await userEvent.click(screen.getAllByRole('button', { name: m.queue_move_down() })[0]);
        expect(queue.reorder).toHaveBeenCalledWith(['q2', 'q1']);
        await userEvent.click(screen.getAllByRole('button', { name: m.common_delete() })[1]);
        expect(queue.remove).toHaveBeenCalledWith('q2');
    });

    it('asks before clearing the whole queue', async () => {
        await renderWithProviders(<QueuePage />);
        await screen.findByText('bracket.gcode');
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_clear()) }));
        const dialog = alertConfirmationDialogStore.state;
        expect(dialog.title).toBe(m.queue_clear_title());
        await dialog.onAction?.();
        expect(queue.clear).toHaveBeenCalledOnce();
    });

    it('counts down the automatic start of each printer and cancels it', async () => {
        queue.status.mockImplementation(async (id: string) => ({
            awaitingBedClear: false,
            maintenance: false,
            nextFilename: null,
            autoStartAt: id === 'p2' ? new Date(Date.now() + 9_500).toISOString() : null,
        }));
        await renderWithProviders(<QueuePage />);
        expect(await screen.findByText(`Kobra X · ${m.queue_starts_in({ seconds: 10 })}`)).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.queue_cancel_start() }));
        expect(queue.cancelAutoStart).toHaveBeenCalledWith('p2');
    });

    it('lists the printers waiting for bed removal', async () => {
        await renderWithProviders(<QueuePage />);
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_tab_removal()) }));
        expect(screen.getByText(`Kobra 4 · ${m.queue_bed_waiting()}`)).toBeTruthy();
        expect(screen.queryByText(`Kobra X · ${m.queue_bed_waiting()}`)).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_bed_good()) }));
        expect(queue.bedClear).toHaveBeenCalledWith('p1', 'good');
    });

    it('lists and removes the scheduled prints of every printer', async () => {
        await renderWithProviders(<QueuePage />);
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_tab_scheduled()) }));
        expect(await screen.findByText(/Kobra X · night\.gcode/)).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.common_delete() }));
        expect(schedule.remove).toHaveBeenCalledWith('p2', 's1');
    });

    it('shows the empty states', async () => {
        queue.all.mockResolvedValue([]);
        schedule.list.mockResolvedValue([]);
        state.printers = [{ ...kobra, awaitingBedClear: false }] as unknown as PrinterWithLive[];
        await renderWithProviders(<QueuePage />);
        expect(await screen.findByText(m.queue_empty())).toBeTruthy();
        expect(screen.queryByRole('button', { name: new RegExp(m.queue_clear()) })).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_tab_removal()) }));
        expect(screen.getByText(m.queue_removal_empty())).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_tab_scheduled()) }));
        expect(screen.getByText(m.queue_scheduled_empty())).toBeTruthy();
    });
});

describe('FilesPage', () => {
    it('shows the files of the first printer', async () => {
        await renderWithProviders(<FilesPage />);
        expect(screen.getByText('files of p1')).toBeTruthy();
        expect(screen.getByRole('combobox', { name: m.stats_all_printers() })).toBeTruthy();
    });

    it('hides the printer picker with a single printer', async () => {
        state.printers = [kobra] as unknown as PrinterWithLive[];
        await renderWithProviders(<FilesPage />);
        expect(screen.getByText('files of p1')).toBeTruthy();
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('explains when there is no printer', async () => {
        state.printers = [];
        await renderWithProviders(<FilesPage />);
        expect(screen.getByText(m.page_no_printer())).toBeTruthy();
    });
});

describe('HistoryPage', () => {
    it('lists the jobs of every printer with the printer name', async () => {
        await renderWithProviders(<HistoryPage />);
        expect(await screen.findByText(/lid/)).toBeTruthy();
        expect(files.historyAll).toHaveBeenCalledWith(undefined);
        await waitFor(() => expect(screen.getByText(/Kobra X/)).toBeTruthy());
    });

    it('shows the empty history', async () => {
        files.historyAll.mockResolvedValue([]);
        state.printers = [kobra] as unknown as PrinterWithLive[];
        await renderWithProviders(<HistoryPage />);
        expect(await screen.findByText(m.history_empty())).toBeTruthy();
    });
});

describe('MaintenancePage', () => {
    it('shows the tasks of every printer', async () => {
        await renderWithProviders(<MaintenancePage />);
        expect(screen.getByText('tasks of p1')).toBeTruthy();
        expect(screen.getByText('tasks of p2')).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Kobra X' })).toBeTruthy();
    });

    it('explains when there is no printer', async () => {
        state.printers = [];
        await renderWithProviders(<MaintenancePage />);
        expect(screen.getByText(m.page_no_printer())).toBeTruthy();
    });
});
