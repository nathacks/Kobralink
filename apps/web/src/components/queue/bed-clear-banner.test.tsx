import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { BedClearBanner } from './bed-clear-banner';

const { queue, toast } = vi.hoisted(() => ({
    queue: { bedClear: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/api', () => ({ api: { queue } }));

beforeEach(() => {
    queue.bedClear.mockReset().mockResolvedValue({ started: { filename: 'bracket.gcode' } });
    toast.success.mockReset();
    toast.error.mockReset();
    toast.info.mockReset();
});

describe('BedClearBanner', () => {
    it('names the printer and starts the next file when the print was good', async () => {
        await renderWithProviders(<BedClearBanner printerId="p1" name="Kobra 4" />);
        expect(screen.getByText(`Kobra 4 · ${m.queue_bed_waiting()}`)).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_bed_good()) }));
        expect(queue.bedClear).toHaveBeenCalledWith('p1', 'good');
        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith(m.files_print_started({ name: 'bracket.gcode' })),
        );
    });

    it('reports a bad print without a toast when nothing starts', async () => {
        queue.bedClear.mockResolvedValue({ started: null });
        await renderWithProviders(<BedClearBanner printerId="p1" />);
        expect(screen.getByText(m.queue_bed_waiting())).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_bed_bad()) }));
        expect(queue.bedClear).toHaveBeenCalledWith('p1', 'bad');
        await waitFor(() => expect(queue.bedClear).toHaveBeenCalledOnce());
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('announces when the next file will start after the wait', async () => {
        queue.bedClear.mockResolvedValue({ started: null, startsAt: new Date(Date.now() + 14_500).toISOString() });
        await renderWithProviders(<BedClearBanner printerId="p1" />);
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_bed_good()) }));
        await waitFor(() => expect(toast.info).toHaveBeenCalledWith(m.queue_starts_in({ seconds: 15 })));
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('shows the error when the confirmation fails', async () => {
        queue.bedClear.mockRejectedValue(new Error('Printer offline'));
        await renderWithProviders(<BedClearBanner printerId="p1" />);
        await userEvent.click(screen.getByRole('button', { name: new RegExp(m.queue_bed_good()) }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Printer offline'));
    });
});
