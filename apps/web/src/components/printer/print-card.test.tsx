import type { PrinterLiveState } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import { PrintCard } from './print-card';

const { live, control } = vi.hoisted(() => ({
    live: {} as Record<string, unknown>,
    control: { pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), clearFileReady: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
    api: new Proxy({ control } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));

vi.mock('@/hooks/use-printers', () => ({
    useLiveState: () => live as unknown as PrinterLiveState,
}));

const IDLE = {
    connected: true,
    printState: 'standby',
    kobraState: 'free',
    filename: '',
    thumbnail: '',
    progress: 0,
    printDurationSec: 0,
    remainTimeSec: 0,
    printTimeAt: 0,
    slicerTimeSec: 0,
    currLayer: 0,
    totalLayers: 0,
    fileReady: '',
    pauseMsg: '',
    errorCode: 0,
};

beforeEach(() => {
    for (const k of Object.keys(live)) delete live[k];
    Object.assign(live, IDLE);
    for (const fn of Object.values(control)) fn.mockReset().mockResolvedValue(undefined);
    confirmationDialogStore.actions.closeDialog();
    alertConfirmationDialogStore.actions.closeAlertDialog();
});

describe('PrintCard', () => {
    it('shows the idle state without print controls', async () => {
        await renderWithProviders(<PrintCard printerId="p1" />);
        expect(screen.getByText(m.print_none())).toBeTruthy();
        expect(screen.getByText(m.print_idle_hint())).toBeTruthy();
        expect(screen.queryByRole('button', { name: m.common_pause() })).toBeNull();
        expect(screen.queryByText(m.print_elapsed())).toBeNull();
    });

    it('shows the offline state', async () => {
        live.connected = false;
        await renderWithProviders(<PrintCard printerId="p1" />);
        expect(screen.getByText(m.common_printer_offline())).toBeTruthy();
    });

    it('shows the progress, times and layer while printing and pauses', async () => {
        Object.assign(live, {
            printState: 'printing',
            filename: 'bracket_plate_2.gcode',
            progress: 0.42,
            printDurationSec: 600,
            remainTimeSec: 1200,
            currLayer: 12,
            totalLayers: 80,
        });
        await renderWithProviders(<PrintCard printerId="p1" />);
        expect(screen.getByText('42%')).toBeTruthy();
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
        expect(screen.getByText(m.print_in_progress())).toBeTruthy();
        expect(screen.getByText('12/80')).toBeTruthy();
        expect(screen.getByText(m.print_elapsed())).toBeTruthy();
        expect(screen.getByText(m.print_remaining())).toBeTruthy();
        expect(screen.queryByText(m.print_idle_hint())).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: m.common_pause() }));
        expect(control.pause).toHaveBeenCalledWith('p1');
    });

    it('shows the calibration instead of the progress and the elapsed time', async () => {
        Object.assign(live, {
            printState: 'printing',
            kobraState: 'auto_leveling',
            filename: 'bracket.gcode',
            progress: 0,
            remainTimeSec: 7080,
            printTimeAt: Date.now(),
        });
        await renderWithProviders(<PrintCard printerId="p1" />);
        expect(screen.getByText(m.state_calibrating())).toBeTruthy();
        expect(screen.getByText(m.print_calibrating_hint({ step: m.state_auto_leveling() }))).toBeTruthy();
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(screen.queryByText('0%')).toBeNull();
        const elapsed = screen.getByText(m.print_elapsed()).parentElement;
        expect(elapsed?.textContent).toBe(`${m.print_elapsed()}—`);
        expect(screen.getByRole('button', { name: m.common_pause() })).toBeTruthy();
    });

    it('resumes a paused print and shows the pause message', async () => {
        Object.assign(live, {
            printState: 'paused',
            filename: 'bracket.gcode',
            progress: 0.5,
            pauseMsg: 'Filament runout',
            errorCode: 10,
        });
        await renderWithProviders(<PrintCard printerId="p1" />);
        expect(screen.getByText(m.print_paused())).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toBe('[10] Filament runout');
        expect(screen.queryByRole('button', { name: m.common_pause() })).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: m.common_resume() }));
        expect(control.resume).toHaveBeenCalledWith('p1');
    });

    it('explains a known pause code in the interface language', async () => {
        Object.assign(live, {
            printState: 'paused',
            filename: 'bracket.gcode',
            progress: 0.5,
            pauseMsg: 'Filament entanglement or jam detected, please manually straighten the filament',
            errorCode: 11842,
        });
        await renderWithProviders(<PrintCard printerId="p1" />);
        expect(screen.getByRole('alert').textContent).toBe(`[11842] ${m.printer_error_tangle_or_clog()}`);
    });

    it('asks before cancelling and opens the skip objects dialog', async () => {
        Object.assign(live, { printState: 'printing', filename: 'bracket.gcode', progress: 0.1 });
        await renderWithProviders(<PrintCard printerId="p1" />);
        await userEvent.click(screen.getByRole('button', { name: m.common_cancel() }));
        const alert = alertConfirmationDialogStore.state;
        expect(alert.isOpen).toBe(true);
        expect(alert.title).toBe(m.print_cancel_title());
        expect(control.cancel).not.toHaveBeenCalled();
        await alert.onAction?.();
        expect(control.cancel).toHaveBeenCalledWith('p1', '');
        await userEvent.click(screen.getByRole('button', { name: m.print_skip_objects() }));
        expect(confirmationDialogStore.state.isOpen).toBe(true);
        expect(confirmationDialogStore.state.title).toBe(m.print_skip_objects());
    });

    it('shows a file ready on the printer and dismisses it', async () => {
        live.fileReady = 'lid.gcode';
        await renderWithProviders(<PrintCard printerId="p1" />);
        expect(screen.getByText('lid.gcode')).toBeTruthy();
        expect(screen.queryByText(m.print_idle_hint())).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: m.common_close() }));
        expect(control.clearFileReady).toHaveBeenCalledWith('p1');
    });
});
