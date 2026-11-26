import type { GcodeFileDto, PrinterLiveState } from '@kobralink/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { PrintReadyForm } from './print-ready-form';

vi.mock('@/lib/queries', () => ({
    appSettingsQuery: { queryKey: ['settings'], queryFn: async () => mocks.settings },
    spoolmanStatusQuery: () => ({ queryKey: ['spoolman-status'], queryFn: async () => mocks.spoolman }),
    spoolmanSpoolsQuery: () => ({ queryKey: ['spoolman-spools'], queryFn: async () => mocks.spools }),
    filamentSlotsQuery: () => ({ queryKey: ['slots'], queryFn: async () => [] }),
    fileObjectsQuery: () => ({ queryKey: ['objects'], queryFn: async () => ({ names: [], svgB64: '' }) }),
}));

vi.mock('@/hooks/use-slot-spool', () => ({
    useSpoolLookup: () => (slot: string) => ({ remainingG: mocks.remaining[slot] }),
}));

vi.mock('@/lib/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/api')>();
    return { ...actual, api: { ...actual.api, printers: { ...actual.api.printers, update: mocks.update } } };
});

vi.mock('./print-preview-3d', () => ({ PrintPreview3D: () => <div data-testid="preview-3d" /> }));

const mocks = vi.hoisted(() => ({
    update: vi.fn(() => new Promise(() => {})),
    remaining: {} as Record<string, number | undefined>,
    settings: null as unknown,
    spoolman: { configured: false, slotSpools: {} } as unknown,
    spools: [] as unknown[],
    live: { connected: true, printState: 'standby', amsSlots: [], filamentMode: 'single' },
    printer: {
        settings: {
            autoLeveling: true,
            vibrationCompensation: false,
            flowCalibration: true,
            timelapseEnabled: true,
            failureDetection: false,
            profile: { powerW: null },
        },
    },
}));

vi.mock('@/hooks/use-printers', () => ({
    useLiveState: (_id: string, select: (s: PrinterLiveState) => unknown) =>
        select(mocks.live as unknown as PrinterLiveState),
    usePrinter: (_id: string, select: (p: typeof mocks.printer) => unknown) => select(mocks.printer),
}));

const file = {
    id: 'f1',
    filename: '20261022-173630-Anti-Wobble+V2_plate(01)_PETG_0.28_1h19m.gcode',
    estPrintTimeSec: 4740,
    layerHeight: 0.28,
    thumbnail: '',
    filaments: [{ slotIndex: 0, material: 'PETG', colorHex: '#111111', isUsed: true }],
    objects: [],
} as unknown as GcodeFileDto;

describe('PrintReadyForm', () => {
    it('shows the 3D preview and the readable part name', async () => {
        await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} />);
        expect(screen.getByTestId('preview-3d')).toBeTruthy();
        expect(screen.getByText('Anti-Wobble V2')).toBeTruthy();
        expect(screen.getByText('Plate 1')).toBeTruthy();
    });

    it('starts each option from the printer settings', async () => {
        await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} />);
        const state = (name: RegExp) => screen.getByRole('switch', { name }).getAttribute('aria-checked');
        expect(state(/auto bed leveling/i)).toBe('true');
        expect(state(/vibration compensation/i)).toBe('false');
        expect(state(/flow calibration/i)).toBe('true');
        expect(state(/record a timelapse/i)).toBe('true');
        expect(state(/failure detection/i)).toBe('false');
    });

    it('starts flow calibration off when the printer has it off, and on when the setting is unknown', async () => {
        const settings = mocks.printer.settings as Record<string, unknown>;
        settings.flowCalibration = false;
        const first = await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} />);
        expect(screen.getByRole('switch', { name: /flow calibration/i }).getAttribute('aria-checked')).toBe('false');
        first.unmount();
        delete settings.flowCalibration;
        await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} />);
        expect(screen.getByRole('switch', { name: /flow calibration/i }).getAttribute('aria-checked')).toBe('true');
        settings.flowCalibration = true;
    });

    it('shows the three calibration options while the printer has not reported its features', async () => {
        await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} />);
        for (const name of [/auto bed leveling/i, /vibration compensation/i, /flow calibration/i]) {
            expect(screen.getByRole('switch', { name })).toBeTruthy();
        }
    });

    it('hides the calibration options the printer does not report', async () => {
        const live = mocks.live as Record<string, unknown>;
        live.features = { auto_leveling_support: true, vibration_compensation_support: false };
        try {
            const onPrint = vi.fn().mockResolvedValue(undefined);
            await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={onPrint} />);
            expect(screen.getByRole('switch', { name: /auto bed leveling/i })).toBeTruthy();
            expect(screen.queryByRole('switch', { name: /vibration compensation/i })).toBeNull();
            expect(screen.queryByRole('switch', { name: /flow calibration/i })).toBeNull();
            expect(screen.getByRole('switch', { name: /record a timelapse/i })).toBeTruthy();
            await userEvent.click(screen.getByRole('button', { name: /print/i }));
            expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ autoLeveling: true }));
        } finally {
            delete live.features;
        }
    });

    it('sends the options chosen for this print', async () => {
        const onPrint = vi.fn().mockResolvedValue(undefined);
        await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={onPrint} />);
        await userEvent.click(screen.getByRole('switch', { name: /vibration compensation/i }));
        await userEvent.click(screen.getByRole('switch', { name: /flow calibration/i }));
        await userEvent.click(screen.getByRole('switch', { name: /record a timelapse/i }));
        await userEvent.click(screen.getByRole('button', { name: /print/i }));
        expect(onPrint).toHaveBeenCalledWith(
            expect.objectContaining({
                autoLeveling: true,
                vibrationCompensation: true,
                flowCalibration: false,
                timelapse: false,
                failureDetection: false,
            }),
        );
    });
});

const pickDay = (d: Date) => document.querySelector(`[data-day="${d.toLocaleDateString()}"]`) as HTMLElement;

describe('PrintReadyForm scheduling', () => {
    it('remembers the chosen options for the next prints, and saves nothing when unchanged', async () => {
        mocks.update.mockClear();
        const onPrint = vi.fn().mockResolvedValue(undefined);
        const first = await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={onPrint} />);
        await userEvent.click(screen.getByRole('button', { name: /print/i }));
        expect(mocks.update).not.toHaveBeenCalled();
        first.unmount();
        await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={onPrint} />);
        await userEvent.click(screen.getByRole('switch', { name: /record a timelapse/i }));
        await userEvent.click(screen.getByRole('button', { name: /print/i }));
        expect(mocks.update).toHaveBeenCalledWith('p1', {
            settings: {
                autoLeveling: true,
                vibrationCompensation: false,
                flowCalibration: true,
                timelapseEnabled: false,
                failureDetection: false,
            },
        });
    });

    it('offers no schedule button without a handler', async () => {
        await renderWithProviders(<PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} />);
        expect(screen.queryByRole('button', { name: m.schedule_button() })).toBeNull();
    });

    it('opens the date and time picker at the next full hour and schedules with the options', async () => {
        const onSchedule = vi.fn().mockResolvedValue(undefined);
        await renderWithProviders(
            <PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} onSchedule={onSchedule} />,
        );
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 17, 10, 7));
        try {
            expect(screen.queryByRole('button', { name: m.schedule_start_at() })).toBeNull();
            await userEvent.click(screen.getByRole('button', { name: m.schedule_button() }));
            const trigger = screen.getByRole('button', { name: m.schedule_start_at() });
            expect(trigger.textContent).toContain('11:00');
            await userEvent.click(trigger);
            await userEvent.click(pickDay(new Date(2026, 10, 18)));
            fireEvent.keyDown(screen.getByRole('slider', { name: m.schedule_hour() }), { key: 'Enter' });
            await userEvent.click(screen.getByRole('button', { name: m.common_ok() }));
            await userEvent.click(screen.getByRole('switch', { name: /record a timelapse/i }));
            await userEvent.click(screen.getByRole('button', { name: m.schedule_confirm() }));
            await waitFor(() => expect(onSchedule).toHaveBeenCalledOnce());
        } finally {
            vi.useRealTimers();
        }
        const [options, startAt] = onSchedule.mock.calls[0];
        expect(options).toMatchObject({ autoLeveling: true, timelapse: false });
        expect(startAt).toBe(new Date(2026, 10, 18, 11, 0).toISOString());
    });

    it('does not schedule a time in the past', async () => {
        const onSchedule = vi.fn().mockResolvedValue(undefined);
        await renderWithProviders(
            <PrintReadyForm printerId="p1" file={file} onPrint={vi.fn()} onSchedule={onSchedule} />,
        );
        await userEvent.click(screen.getByRole('button', { name: m.schedule_button() }));
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 3 * 3_600_000);
        await userEvent.click(screen.getByRole('button', { name: m.schedule_confirm() }));
        vi.useRealTimers();
        expect(onSchedule).not.toHaveBeenCalled();
    });
});

describe('PrintReadyForm filament check', () => {
    const used = (usedG?: number) =>
        ({
            ...file,
            filaments: [{ slotIndex: 0, material: 'PETG', colorHex: '#111111', isUsed: true, usedG }],
        }) as unknown as GcodeFileDto;
    const printButton = () => screen.getByRole('button', { name: /^print$/i });

    it('says the external spool has enough filament', async () => {
        mocks.remaining = { '0': 900 };
        await renderWithProviders(<PrintReadyForm printerId="p1" file={used(120)} onPrint={vi.fn()} />);
        expect(screen.getByText(m.print_ready_filament_title())).toBeTruthy();
        expect(screen.getByText(m.print_ready_filament_external())).toBeTruthy();
        expect(screen.getByText(m.print_ready_filament_ok())).toBeTruthy();
        expect((printButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('holds the print until a short spool is accepted', async () => {
        mocks.remaining = { '0': 50 };
        const onPrint = vi.fn().mockResolvedValue(undefined);
        await renderWithProviders(<PrintReadyForm printerId="p1" file={used(120)} onPrint={onPrint} />);
        expect(screen.getByText(m.print_ready_filament_short())).toBeTruthy();
        expect(screen.getByText(m.print_ready_filament_short_hint())).toBeTruthy();
        expect((printButton() as HTMLButtonElement).disabled).toBe(true);
        await userEvent.click(screen.getByRole('switch', { name: m.print_ready_filament_accept() }));
        expect((printButton() as HTMLButtonElement).disabled).toBe(false);
        await userEvent.click(printButton());
        expect(onPrint).toHaveBeenCalled();
    });

    it('shows only the need when the spool is unknown', async () => {
        mocks.remaining = {};
        await renderWithProviders(<PrintReadyForm printerId="p1" file={used(119.2)} onPrint={vi.fn()} />);
        expect(screen.getByText(m.print_ready_filament_unknown())).toBeTruthy();
        expect(screen.getByText(new RegExp(m.print_ready_filament_need({ need: 120 })))).toBeTruthy();
        expect((printButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('stays out of the way when the file has no usage', async () => {
        mocks.remaining = { '0': 10 };
        await renderWithProviders(<PrintReadyForm printerId="p1" file={used(undefined)} onPrint={vi.fn()} />);
        expect(screen.queryByText(m.print_ready_filament_title())).toBeNull();
    });
});

describe('PrintReadyForm cost estimate', () => {
    const priced = {
        ...file,
        filaments: [{ slotIndex: 0, material: 'PETG', colorHex: '#111111', isUsed: true, usedG: 30 }],
    } as unknown as GcodeFileDto;

    it('prices the file with the spool loaded in the external slot and the energy', async () => {
        mocks.settings = {
            currency: 'BRL',
            filamentPricePerKg: 100,
            costs: { energyPricePerKwh: 1, printerPowerW: 100 },
        };
        mocks.spoolman = { configured: true, slotSpools: { '0': 7 } };
        mocks.spools = [
            { id: 7, price: 20, initial_weight: 1000, filament: { material: 'PETG', density: 1.27, diameter: 1.75 } },
        ];
        await renderWithProviders(<PrintReadyForm printerId="p1" file={priced} onPrint={vi.fn()} />);
        const card = await screen.findByRole('region', { name: m.cost_estimate() });
        expect(card.textContent).toContain(formatMoney(0.6, 'BRL'));
        expect(card.textContent).toContain(formatMoney(0.13, 'BRL'));
        expect(card.textContent).toContain(`≈ ${formatMoney(0.73, 'BRL')}`);
        expect(card.textContent).toContain('30 g');
    });

    it('falls back to the default price without a mapped spool', async () => {
        mocks.settings = {
            currency: 'BRL',
            filamentPricePerKg: 100,
            costs: { energyPricePerKwh: 0, printerPowerW: 0 },
        };
        mocks.spoolman = { configured: false, slotSpools: {} };
        mocks.spools = [];
        await renderWithProviders(<PrintReadyForm printerId="p1" file={priced} onPrint={vi.fn()} />);
        const card = await screen.findByRole('region', { name: m.cost_estimate() });
        expect(card.textContent).toContain(`≈ ${formatMoney(3, 'BRL')}`);
    });

    it('shows no estimate when nothing is priced', async () => {
        mocks.settings = { currency: 'BRL', filamentPricePerKg: 0, costs: { energyPricePerKwh: 0, printerPowerW: 0 } };
        await renderWithProviders(<PrintReadyForm printerId="p1" file={priced} onPrint={vi.fn()} />);
        await screen.findByText('Anti-Wobble V2');
        expect(screen.queryByRole('region', { name: m.cost_estimate() })).toBeNull();
    });
});
