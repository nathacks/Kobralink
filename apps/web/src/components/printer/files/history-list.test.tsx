import type { PrintJobDto } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatDuration, formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { jobStatusLabel } from '@/lib/labels';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import { HistoryList } from './history-list';

vi.mock('@/lib/api', () => ({
    api: new Proxy(
        {
            settings: { get: vi.fn().mockResolvedValue({ currency: 'BRL' }) },
        } as Record<string, unknown>,
        { get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }) },
    ),
}));

const base: PrintJobDto = {
    id: 'j1',
    printerId: 'p1',
    fileId: null,
    filename: '20261022-173630-Anti-Wobble+V2_plate(01)_PETG_0.28_1h19m.gcode',
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
    cost: { filament: 0.5, energy: 0.1, total: 0.6 },
};

const failed: PrintJobDto = {
    ...base,
    id: 'j2',
    filename: 'lid.gcode',
    status: 'cancelled',
    failureReason: 'spaghetti',
    note: 'support failed',
    hasSnapshot: true,
    cost: null,
};

describe('HistoryList', () => {
    it('shows the empty message without jobs', async () => {
        await renderWithProviders(<HistoryList printerId="p1" jobs={[]} />);
        expect(screen.getByText(m.history_empty())).toBeTruthy();
    });

    it('breaks the cost down into filament, energy and total in the configured currency', async () => {
        await renderWithProviders(<HistoryList printerId="p1" jobs={[base]} />);
        expect(screen.getByRole('heading', { name: 'Anti-Wobble V2' })).toBeTruthy();
        expect(await screen.findByText(formatMoney(0.5, 'BRL'))).toBeTruthy();
        expect(screen.getByText(formatMoney(0.1, 'BRL'))).toBeTruthy();
        expect(screen.getByText(formatMoney(0.6, 'BRL'))).toBeTruthy();
        expect(screen.getByText(m.history_cost_filament())).toBeTruthy();
        expect(screen.getByText(m.history_cost_energy())).toBeTruthy();
        expect(screen.getByText(m.history_cost_total())).toBeTruthy();
        expect(screen.queryByText(/machine/i)).toBeNull();
    });

    it('shows no cost block for an unpriced job', async () => {
        await renderWithProviders(<HistoryList printerId="p1" jobs={[failed]} />);
        expect(screen.queryByText(m.history_cost_total())).toBeNull();
    });

    it('shows the G-code thumbnail as a preview, with a placeholder without one', async () => {
        const { container } = await renderWithProviders(
            <HistoryList
                printerId="p1"
                jobs={[
                    { ...base, thumbnail: 'AAAA' },
                    { ...base, id: 'j3' },
                ]}
            />,
        );
        const images = container.querySelectorAll('img');
        expect(images).toHaveLength(1);
        expect(images[0]?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
        expect(screen.getAllByText(m.files_no_preview())).toHaveLength(1);
    });

    it('shows the status, the printer name and the duration on each card', async () => {
        await renderWithProviders(<HistoryList printerId="" jobs={[base, failed]} printerNames={{ p1: 'Kobra 4' }} />);
        expect(screen.getByText(jobStatusLabel('completed'))).toBeTruthy();
        expect(screen.getAllByText(/^Kobra 4 · /)).toHaveLength(2);
        expect(screen.getAllByText(formatDuration(3600))).toHaveLength(2);
    });

    it('labels only failed jobs', async () => {
        await renderWithProviders(<HistoryList printerId="p1" jobs={[base, failed]} />);
        const label = screen.getByRole('button', { name: /support failed/ });
        expect(label.textContent).toContain(m.failure_reason_spaghetti());
        expect(label.querySelectorAll('svg')).toHaveLength(2);
        expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('shows the energy measured for a print', async () => {
        await renderWithProviders(
            <HistoryList
                printerId="p1"
                jobs={[
                    { ...base, energyKwh: 0.4321 },
                    { ...base, id: 'j9' },
                ]}
            />,
        );
        expect(screen.getAllByText(`${m.history_cost_energy()} · ${m.energy_kwh({ kwh: '0.43' })}`)).toHaveLength(1);
        expect(screen.getAllByText(m.history_cost_energy())).toHaveLength(1);
    });

    it('opens the failure dialog for the clicked job', async () => {
        const open = vi.spyOn(confirmationDialogStore.actions, 'openDialog').mockImplementation(() => undefined);
        await renderWithProviders(<HistoryList printerId="p1" jobs={[failed]} />);
        await userEvent.click(screen.getByRole('button', { name: /support failed/ }));
        expect(open).toHaveBeenCalledOnce();
        expect(open.mock.calls[0][0]).toMatchObject({ title: m.history_edit_failure(), description: 'lid' });
        open.mockRestore();
    });

    it('labels an unlabeled failure as such', async () => {
        await renderWithProviders(
            <HistoryList printerId="p1" jobs={[{ ...failed, failureReason: '', note: '', hasSnapshot: false }]} />,
        );
        const label = screen.getByRole('button');
        expect(label.textContent).toContain(m.failure_reason_none());
        expect(label.querySelectorAll('svg')).toHaveLength(1);
    });
});
