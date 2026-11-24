import type { GcodeFileDto } from '@kobralink/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCostEstimate } from './use-cost-estimate';

const mocks = vi.hoisted(() => ({
    settings: {
        currency: 'BRL',
        filamentPricePerKg: 100,
        costs: { energyPricePerKwh: 1, printerPowerW: 100 },
    } as unknown,
    powerW: 200 as number | null,
    spoolman: { configured: true, slotSpools: { '0': 1, '1': 2 } },
    spools: [
        { id: 1, price: 10, initial_weight: 1000, filament: { material: 'PLA', density: 1.24, diameter: 1.75 } },
        { id: 2, price: 40, initial_weight: 1000, filament: { material: 'PETG', density: 1.27, diameter: 1.75 } },
    ],
}));

vi.mock('@/lib/queries', () => ({
    appSettingsQuery: { queryKey: ['settings'], queryFn: async () => mocks.settings },
    spoolmanStatusQuery: () => ({ queryKey: ['spoolman-status'], queryFn: async () => mocks.spoolman }),
    spoolmanSpoolsQuery: () => ({ queryKey: ['spoolman-spools'], queryFn: async () => mocks.spools }),
}));

vi.mock('@/hooks/use-printers', () => ({
    usePrinter: (_id: string, select: (p: unknown) => unknown) =>
        select({ settings: { profile: { powerW: mocks.powerW } } }),
}));

const file = (material: string, usedG: number, slotIndex = 0) =>
    ({
        estPrintTimeSec: 3600,
        filaments: [
            { slotIndex, material, colorHex: '#fff', isUsed: true, usedG },
            { slotIndex: 5, material: 'ABS', colorHex: '#000', isUsed: false, usedG: 99 },
        ],
    }) as unknown as GcodeFileDto;

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useCostEstimate('p1'), { wrapper });
}

describe('useCostEstimate', () => {
    it('prices with the mapped spool of the same material and the printer power draw', async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.estimate(file('PETG', 20))).not.toBeNull());
        expect(result.current.currency).toBe('BRL');
        expect(result.current.estimate(file('PETG', 20))).toEqual({
            filament: 0.8,
            energy: 0.2,
            total: 1,
            weightG: 20,
            unpricedG: 0,
        });
        await waitFor(() => expect(result.current.estimate(file('PLA', 20))?.filament).toBe(0.2));
    });

    it('uses the slot chosen in the print dialog over the material match', async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.estimate(file('PLA', 20))?.filament).toBe(0.2));
        expect(result.current.estimate(file('PLA', 20), new Map([[0, '1']]))?.filament).toBe(0.8);
    });

    it('falls back to the default price when no spool matches', async () => {
        const { result } = setup();
        await waitFor(() => expect(result.current.estimate(file('ABS', 20))?.filament).toBe(2));
    });
});
