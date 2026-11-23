import type { PrinterLiveState } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { TemperatureCard } from './temperature-card';

const { live, control, samples } = vi.hoisted(() => ({
    live: {} as Record<string, unknown>,
    control: { temperature: vi.fn() },
    samples: { list: [] as { t: number; nozzle: number; bed: number; progress: number }[], ready: false },
}));

vi.mock('@/lib/api', () => ({
    api: new Proxy({ control } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));

vi.mock('@/hooks/use-printers', () => ({
    useLiveState: () => live as unknown as PrinterLiveState,
    useSamples: () => samples.list,
    useSamplesReady: () => samples.ready,
}));

beforeEach(() => {
    Object.assign(live, { connected: true, nozzleTemp: 36.4, nozzleTarget: 0, bedTemp: 58.6, bedTarget: 60 });
    samples.list = [];
    samples.ready = false;
    control.temperature.mockReset().mockResolvedValue(undefined);
});

const nozzleForm = () => screen.getByRole('form', { name: m.activity_nozzle() });
const nozzleInput = () => screen.getByRole('spinbutton', { name: `${m.activity_nozzle()} · ${m.activity_target()}` });

describe('TemperatureCard', () => {
    it('shows the current and target temperature of each heater', async () => {
        await renderWithProviders(<TemperatureCard printerId="p1" />);
        expect(nozzleForm().textContent).toContain('36°');
        expect(nozzleForm().textContent).toContain(`${m.activity_target()} 0 °C`);
        const bed = screen.getByRole('form', { name: m.activity_bed() });
        expect(bed.textContent).toContain('59°');
        expect(bed.textContent).toContain(`${m.activity_target()} 60 °C`);
    });

    it('applies a material preset to both heaters', async () => {
        await renderWithProviders(<TemperatureCard printerId="p1" />);
        await userEvent.click(screen.getByRole('button', { name: 'PETG' }));
        expect(control.temperature).toHaveBeenCalledWith('p1', { nozzle: 235, bed: 75 });
        await userEvent.click(screen.getByRole('button', { name: m.temp_preset_off() }));
        expect(control.temperature).toHaveBeenLastCalledWith('p1', { nozzle: 0, bed: 0 });
    });

    it('sets a single heater target', async () => {
        await renderWithProviders(<TemperatureCard printerId="p1" />);
        await userEvent.clear(nozzleInput());
        await userEvent.type(nozzleInput(), '215');
        await userEvent.click(screen.getAllByRole('button', { name: m.temp_set() })[0]);
        expect(control.temperature).toHaveBeenCalledWith('p1', { nozzle: 215 });
    });

    it('refuses a target out of range', async () => {
        await renderWithProviders(<TemperatureCard printerId="p1" />);
        await userEvent.clear(nozzleInput());
        await userEvent.type(nozzleInput(), '400');
        await userEvent.click(screen.getAllByRole('button', { name: m.temp_set() })[0]);
        expect(control.temperature).not.toHaveBeenCalled();
        expect(nozzleInput().getAttribute('aria-invalid')).toBe('true');
    });

    it('disables the presets and the inputs while offline', async () => {
        live.connected = false;
        await renderWithProviders(<TemperatureCard printerId="p1" />);
        expect(screen.getByRole('button', { name: 'PLA' }).hasAttribute('disabled')).toBe(true);
        expect(nozzleInput().hasAttribute('disabled')).toBe(true);
    });

    it('draws the chart only once the history is loaded', async () => {
        samples.list = [
            { t: 1, nozzle: 30, bed: 30, progress: 0 },
            { t: 2, nozzle: 31, bed: 30, progress: 0 },
        ];
        const { unmount } = await renderWithProviders(<TemperatureCard printerId="p1" />);
        expect(screen.getByTestId('temperature-chart').childElementCount).toBe(0);
        unmount();
        samples.ready = true;
        await renderWithProviders(<TemperatureCard printerId="p1" />);
        expect(screen.getByTestId('temperature-chart').querySelector('[data-slot="chart"]')).toBeTruthy();
    });
});
