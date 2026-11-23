import { describe, expect, it } from 'bun:test';
import { hasAnyPricing, type PricingContext, priceJob } from '../src/stats/job-cost';

const noCosts = { energyPricePerKwh: 0, printerPowerW: 0 };

function ctx(over: Partial<PricingContext> = {}): PricingContext {
    return { spools: new Map(), filamentPricePerKg: 0, costs: noCosts, ...over };
}

const job = {
    status: 'completed',
    durationSec: 3600,
    filamentMm: 10_000,
    spoolUsage: '[]',
    filename: 'bracket_PLA_0.2.gcode',
    file: null,
};

describe('priceJob', () => {
    it('weighs the filament from the file material when no spool is known', () => {
        const p = priceJob(job, ctx());
        expect(p.weightG).toBeCloseTo(29.8, 0);
        expect(p.unpricedG).toBeCloseTo(p.weightG, 5);
        expect(p.cost.total).toBe(0);
    });

    it('uses the default price per kg when the spool has none', () => {
        const p = priceJob(job, ctx({ filamentPricePerKg: 20 }));
        expect(p.cost.filament).toBeCloseTo(0.6, 2);
        expect(p.unpricedG).toBe(0);
    });

    it('weighs with the local spool density and prices with the default price', () => {
        const spools = new Map([['s1', { diameterMm: 1.75, densityGcm3: 1.0, material: 'PETG' }]]);
        const usage = JSON.stringify([{ slotIndex: 0, mm: 10_000, material: '', spoolId: 's1' }]);
        const p = priceJob({ ...job, spoolUsage: usage }, ctx({ spools, filamentPricePerKg: 30 }));
        expect(p.usage[0]?.material).toBe('PETG');
        expect(p.weightG).toBeCloseTo(24.05, 1);
        expect(p.cost.filament).toBeCloseTo(0.72, 2);
    });

    it('adds energy from the cost settings, with no machine time', () => {
        const p = priceJob(job, ctx({ costs: { energyPricePerKwh: 1, printerPowerW: 100 } }));
        expect(p.cost).toEqual({ filament: 0, energy: 0.1, total: 0.1 });
    });
});

describe('hasAnyPricing', () => {
    it('is false with no price anywhere and true as soon as one source is set', () => {
        expect(hasAnyPricing(ctx())).toBe(false);
        expect(hasAnyPricing(ctx({ filamentPricePerKg: 1 }))).toBe(true);
        expect(hasAnyPricing(ctx({ costs: { ...noCosts, energyPricePerKwh: 1 } }))).toBe(false);
        expect(hasAnyPricing(ctx({ costs: { ...noCosts, energyPricePerKwh: 1, printerPowerW: 50 } }))).toBe(true);
    });
});

describe('priceJob with printer profiles', () => {
    const printers = new Map([
        ['p1', { powerW: 300 }],
        ['p2', { powerW: null }],
    ]);
    const costs = { energyPricePerKwh: 1, printerPowerW: 100 };

    it('uses the power draw of the printer that ran the job', () => {
        const p = priceJob({ ...job, printerId: 'p1' }, ctx({ costs, printers }));
        expect(p.cost.energy).toBe(0.3);
        expect(p.cost.total).toBe(0.3);
    });

    it('falls back to the default power draw when the printer has none', () => {
        const p = priceJob({ ...job, printerId: 'p2' }, ctx({ costs, printers }));
        expect(p.cost.energy).toBe(0.1);
    });

    it('ignores profiles of other printers', () => {
        expect(priceJob({ ...job, printerId: 'gone' }, ctx({ costs, printers })).cost.energy).toBe(0.1);
        expect(priceJob(job, ctx({ costs, printers })).cost.energy).toBe(0.1);
    });

    it('counts a printer profile as pricing', () => {
        const energy = { ...noCosts, energyPricePerKwh: 1 };
        expect(hasAnyPricing(ctx({ costs: energy, printers: new Map([['p', { measuresEnergy: true }]]) }))).toBe(true);
        expect(hasAnyPricing(ctx({ costs: energy, printers: new Map([['p', { powerW: null }]]) }))).toBe(false);
        expect(hasAnyPricing(ctx({ costs: energy, printers: new Map([['p', { powerW: 200 }]]) }))).toBe(true);
        expect(hasAnyPricing(ctx({ printers: new Map([['p', { powerW: 200 }]]) }))).toBe(false);
    });
});

describe('priceJob with frozen Spoolman usage', () => {
    const frozen = JSON.stringify([
        { slotIndex: 0, mm: 10_000, material: 'PETG', spoolId: null, weightG: 30, pricePerG: 0.025 },
    ]);

    it('uses the weight and the price frozen when the job ended', () => {
        const p = priceJob({ ...job, spoolUsage: frozen }, ctx({ filamentPricePerKg: 999 }));
        expect(p.weightG).toBe(30);
        expect(p.cost.filament).toBe(0.75);
    });

    it('falls back to the default price when Spoolman had none', () => {
        const unpriced = JSON.stringify([
            { slotIndex: 0, mm: 10_000, material: 'PETG', spoolId: null, weightG: 30, pricePerG: null },
        ]);
        expect(priceJob({ ...job, spoolUsage: unpriced }, ctx({ filamentPricePerKg: 20 })).cost.filament).toBe(0.6);
    });
});
