import type { PrinterLiveState } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { PrinterCard } from './printer-card';

vi.mock('@/hooks/use-slot-spool', () => ({
    useExternalSpool: () => ({
        hex: '#ff7a00',
        material: 'PETG',
        name: 'Elegoo Rapid PETG',
        remainingG: 812.4,
        fraction: 0.81,
    }),
    useSlotSpool: () => ({}),
}));

const idle = {
    connected: true,
    connectionError: null,
    printState: 'standby',
    kobraState: 'free',
    nozzleTemp: 24.6,
    nozzleTarget: 0,
    bedTemp: 23.2,
    bedTarget: 0,
    progress: 0,
    remainTimeSec: 0,
    currLayer: 0,
    totalLayers: 0,
    filename: '',
    thumbnail: '',
    cameraUrl: '',
    fanSpeed: 0,
    lightOn: false,
    amsSlots: [],
    amsLoadedSlot: -1,
    externalSpoolOnly: true,
} as unknown as PrinterLiveState;

const printing = {
    ...idle,
    printState: 'printing',
    kobraState: 'printing',
    nozzleTemp: 249.7,
    nozzleTarget: 250,
    bedTemp: 80,
    bedTarget: 80,
    progress: 0.42,
    remainTimeSec: 3300,
    currLayer: 31,
    totalLayers: 74,
    filename: '20261022-173630-5U+Lab+Rax+X2D_plate(03)_PETG_0.2_2h3m.gcode',
    fanSpeed: 50,
    lightOn: true,
} as PrinterLiveState;

function printer(live: PrinterLiveState | null) {
    return { id: 'p1', name: 'Kobra', model: 'Kobra 4', ip: '192.168.1.235', live } as unknown as PrinterWithLive;
}

function actions() {
    return { onPause: vi.fn(), onResume: vi.fn(), onCancel: vi.fn(), onReconnect: vi.fn(), onLight: vi.fn() };
}

describe('PrinterCard', () => {
    it('shows the job, its progress and the layer', async () => {
        await renderWithProviders(<PrinterCard printer={printer(printing)} canOperate {...actions()} />);
        expect(screen.getByText('42%')).toBeTruthy();
        expect(screen.getByText('5U Lab Rax X2D')).toBeTruthy();
        expect(screen.getByText('Layer 31/74')).toBeTruthy();
    });

    it('shows temperatures against their targets', async () => {
        await renderWithProviders(<PrinterCard printer={printer(printing)} canOperate {...actions()} />);
        expect(screen.getByText('Nozzle').closest('div')?.textContent).toContain('250° / 250°');
        expect(screen.getByText('Bed').closest('div')?.textContent).toContain('80° / 80°');
        expect(screen.getByText('50%')).toBeTruthy();
    });

    it('shows the external spool and what is left on it', async () => {
        await renderWithProviders(<PrinterCard printer={printer(idle)} canOperate {...actions()} />);
        expect(screen.getByText('PETG')).toBeTruthy();
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('81');
        expect(screen.getByText('812 g left')).toBeTruthy();
        expect(screen.getByText('81%')).toBeTruthy();
    });

    it('pauses and cancels a running print', async () => {
        const handlers = actions();
        await renderWithProviders(<PrinterCard printer={printer(printing)} canOperate {...handlers} />);
        await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(handlers.onPause).toHaveBeenCalledOnce();
        expect(handlers.onCancel).toHaveBeenCalledOnce();
    });

    it('toggles the light', async () => {
        const handlers = actions();
        await renderWithProviders(<PrinterCard printer={printer(printing)} canOperate {...handlers} />);
        await userEvent.click(screen.getByRole('button', { name: 'Turn light off' }));
        expect(handlers.onLight).toHaveBeenCalledWith(false);
    });

    it('hides print controls from viewers', async () => {
        await renderWithProviders(<PrinterCard printer={printer(printing)} canOperate={false} {...actions()} />);
        expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Turn light off' })).toBeNull();
    });

    it('shows the camera even when the printer is idle', async () => {
        const live = { ...idle, cameraUrl: 'http://printer/live' } as PrinterLiveState;
        await renderWithProviders(<PrinterCard printer={printer(live)} canOperate {...actions()} />);
        expect(screen.getByRole('img', { name: 'Camera stream' }).getAttribute('src')).toContain('/camera/snapshot');
    });

    it('renders a printer that has not reported yet', async () => {
        await renderWithProviders(<PrinterCard printer={printer(null)} canOperate {...actions()} />);
        expect(screen.getByRole('heading', { name: 'Kobra' })).toBeTruthy();
    });
});
