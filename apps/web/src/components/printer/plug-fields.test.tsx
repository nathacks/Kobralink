import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { EnergySensorField, PlugSwitchField } from './plug-fields';

const { homeAssistant } = vi.hoisted(() => ({ homeAssistant: { energySensors: vi.fn(), switches: vi.fn() } }));

vi.mock('@/lib/api', () => ({
    api: new Proxy({ homeAssistant } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));

beforeEach(() => {
    homeAssistant.energySensors.mockReset().mockResolvedValue([
        { entityId: 'sensor.kobra_energy', name: 'Kobra plug', kwh: 12.345 },
        { entityId: 'sensor.attic', name: 'Attic', kwh: null },
    ]);
    homeAssistant.switches.mockReset().mockResolvedValue([
        { entityId: 'switch.kobra_plug', name: 'Kobra plug', on: true },
        { entityId: 'switch.attic', name: 'Attic', on: null },
    ]);
});

describe('PlugSwitchField', () => {
    it('lists the Home Assistant switches and picks one', async () => {
        const onChange = vi.fn();
        await renderWithProviders(<PlugSwitchField value="" onChange={onChange} />);
        await userEvent.click(screen.getByRole('combobox', { name: m.plug_switch() }));
        await userEvent.click(await screen.findByRole('option', { name: 'Kobra plug' }));
        expect(onChange).toHaveBeenCalledWith('switch.kobra_plug');
    });

    it('goes back to no plug', async () => {
        const onChange = vi.fn();
        await renderWithProviders(<PlugSwitchField value="switch.kobra_plug" onChange={onChange} />);
        await userEvent.click(screen.getByRole('combobox', { name: m.plug_switch() }));
        await userEvent.click(await screen.findByRole('option', { name: m.plug_switch_none() }));
        expect(onChange).toHaveBeenCalledWith('');
    });
});

describe('EnergySensorField', () => {
    it('lists the meters with their reading and picks one', async () => {
        const onChange = vi.fn();
        await renderWithProviders(<EnergySensorField value="" onChange={onChange} />);
        await userEvent.click(screen.getByRole('combobox', { name: m.energy_sensor() }));
        await userEvent.click(
            await screen.findByRole('option', { name: `Kobra plug · ${m.energy_kwh({ kwh: '12.35' })}` }),
        );
        expect(onChange).toHaveBeenCalledWith('sensor.kobra_energy');
    });

    it('keeps a saved meter Home Assistant no longer lists and shows a listing error', async () => {
        homeAssistant.energySensors.mockRejectedValue(new Error('Home Assistant refused the token'));
        await renderWithProviders(<EnergySensorField value="sensor.old_plug" onChange={vi.fn()} />);
        expect(screen.getByRole('combobox', { name: m.energy_sensor() }).textContent).toContain('sensor.old_plug');
        await waitFor(() => expect(screen.getByText('Home Assistant refused the token')).toBeTruthy());
    });
});
