import type { PrintJobDto } from '@kobralink/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import { FailureDialog } from './failure-dialog';

const { updateJob, toast } = vi.hoisted(() => ({
    updateJob: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api', () => ({
    api: new Proxy(
        {
            files: {
                updateJob,
                snapshotUrl: (id: string, jobId: string) => `/api/v1/printers/${id}/history/${jobId}/snapshot`,
            },
        } as Record<string, unknown>,
        { get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }) },
    ),
}));

const job: PrintJobDto = {
    id: 'j1',
    printerId: 'p1',
    fileId: null,
    filename: 'bracket.gcode',
    status: 'error',
    startedAt: '2026-10-20T10:00:00.000Z',
    finishedAt: '2026-10-20T11:00:00.000Z',
    durationSec: 3600,
    estimatedSec: 0,
    filamentMm: 0,
    spoolUsage: [],
    thumbnail: null,
    errorCode: 20001,
    errorMsg: 'Spool empty',
    failureReason: 'filament_runout',
    note: 'spool ended',
    hasSnapshot: true,
    pausedAt: null,
    energyKwh: null,
    cost: null,
};

beforeEach(() => {
    updateJob.mockReset().mockResolvedValue(job);
    toast.success.mockReset();
    toast.error.mockReset();
});

describe('FailureDialog', () => {
    it('shows the printer error, the snapshot and the current label', async () => {
        await renderWithProviders(<FailureDialog printerId="p1" job={job} />);
        expect(screen.getByText(/Printer error \[20001\] Spool empty/)).toBeTruthy();
        const img = screen.getByRole('img', { name: m.history_snapshot() }) as HTMLImageElement;
        expect(img.getAttribute('src')).toBe('/api/v1/printers/p1/history/j1/snapshot');
        expect(screen.getAllByText(m.failure_reason_filament_runout()).length).toBeGreaterThan(0);
        expect((screen.getByLabelText(m.history_failure_note()) as HTMLInputElement).value).toBe('spool ended');
    });

    it('explains when no snapshot was captured and hides the error line without a code', async () => {
        await renderWithProviders(
            <FailureDialog printerId="p1" job={{ ...job, hasSnapshot: false, errorCode: 0, errorMsg: '' }} />,
        );
        expect(screen.getByText(m.history_no_snapshot())).toBeTruthy();
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.queryByText(/Printer error/)).toBeNull();
    });

    it('saves the note with the reason, then closes', async () => {
        const close = vi.spyOn(confirmationDialogStore.actions, 'closeDialog').mockImplementation(() => undefined);
        await renderWithProviders(<FailureDialog printerId="p1" job={job} />);
        const note = screen.getByLabelText(m.history_failure_note());
        await userEvent.clear(note);
        await userEvent.type(note, '  new spool  ');
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(updateJob).toHaveBeenCalledOnce());
        expect(updateJob).toHaveBeenCalledWith('p1', 'j1', { failureReason: 'filament_runout', note: 'new spool' });
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith(m.history_failure_saved()));
        expect(close).toHaveBeenCalled();
        close.mockRestore();
    });

    it('reports a failed save and stays open', async () => {
        const close = vi.spyOn(confirmationDialogStore.actions, 'closeDialog').mockImplementation(() => undefined);
        updateJob.mockRejectedValueOnce(new Error('nope'));
        await renderWithProviders(<FailureDialog printerId="p1" job={job} />);
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'));
        expect(close).not.toHaveBeenCalled();
        close.mockRestore();
    });

    it('cancels without saving', async () => {
        const close = vi.spyOn(confirmationDialogStore.actions, 'closeDialog').mockImplementation(() => undefined);
        await renderWithProviders(<FailureDialog printerId="p1" job={job} />);
        await userEvent.click(screen.getByRole('button', { name: m.common_cancel() }));
        expect(close).toHaveBeenCalled();
        expect(updateJob).not.toHaveBeenCalled();
        close.mockRestore();
    });
});
