import { describe, expect, it } from 'bun:test';
import { jobCost } from '../src/cost';

const costs = { energyPricePerKwh: 0.8, printerPowerW: 150 };

describe('jobCost', () => {
    it('adds filament and energy', () => {
        const c = jobCost(2 * 3600, 1.5, costs);
        expect(c).toEqual({ filament: 1.5, energy: 0.24, total: 1.74 });
    });

    it('ignores energy when the settings are zero', () => {
        const c = jobCost(3600, 0.42, { energyPricePerKwh: 0, printerPowerW: 0 });
        expect(c).toEqual({ filament: 0.42, energy: 0, total: 0.42 });
    });

    it('never goes negative', () => {
        const c = jobCost(-10, -1, costs);
        expect(c.total).toBe(0);
    });

    it('has no machine time part', () => {
        expect(Object.keys(jobCost(3600, 1, costs)).sort()).toEqual(['energy', 'filament', 'total']);
    });
});

describe('jobCost with a printer profile', () => {
    it('uses the printer power draw instead of the default one', () => {
        expect(jobCost(3600, 0, costs, { powerW: 300 }).energy).toBe(0.24);
        expect(jobCost(3600, 0, costs, { powerW: 0 }).energy).toBe(0);
        expect(jobCost(3600, 0, costs, { powerW: null }).energy).toBe(0.12);
    });
});
