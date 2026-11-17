import { describe, expect, it } from 'bun:test';
import { estimateCost, spoolPriceFor } from '../src/cost';

const costs = { energyPricePerKwh: 1, printerPowerW: 100 };

describe('spoolPriceFor', () => {
    const slots = [
        { key: '0', material: 'PETG', pricePerG: 0.1 },
        { key: '1', material: 'PLA+', pricePerG: null },
        { key: '2', material: 'PLA', pricePerG: 0.05 },
    ];

    it('uses the assigned slot when the print dialog chose one', () => {
        expect(spoolPriceFor('PLA', slots, '0')).toBe(0.1);
        expect(spoolPriceFor('PLA', slots, '1')).toBeNull();
        expect(spoolPriceFor('PLA', slots, '9')).toBeNull();
    });

    it('picks the first priced spool of the same material family', () => {
        expect(spoolPriceFor('PLA', slots)).toBe(0.05);
        expect(spoolPriceFor('petg-cf', slots)).toBe(0.1);
    });

    it('has no price without a matching spool', () => {
        expect(spoolPriceFor('ABS', slots)).toBeNull();
        expect(spoolPriceFor('PLA', [])).toBeNull();
    });

    it('matches a spool or a file without a material', () => {
        expect(spoolPriceFor('PLA', [{ key: '0', material: '', pricePerG: 0.07 }])).toBe(0.07);
        expect(spoolPriceFor('', slots)).toBe(0.1);
    });
});

describe('estimateCost', () => {
    it('prices the filament weight with the spool price and the time with the energy', () => {
        const e = estimateCost([{ material: 'PLA', usedG: 20, pricePerG: 0.1 }], 3600, {
            defaultPricePerKg: 50,
            costs,
        });
        expect(e).toEqual({ filament: 2, energy: 0.1, total: 2.1, weightG: 20, unpricedG: 0 });
    });

    it('falls back to the default price per kg', () => {
        const e = estimateCost([{ material: 'PLA', usedG: 20, pricePerG: null }], 0, { defaultPricePerKg: 50, costs });
        expect(e?.filament).toBe(1);
    });

    it('weighs the filament from its length when the weight is missing', () => {
        const e = estimateCost([{ material: 'PLA', usedG: null, usedMm: 10_000, pricePerG: 0.1 }], 0, {
            defaultPricePerKg: 0,
            costs,
        });
        expect(e?.weightG).toBeCloseTo(29.82, 1);
        expect(e?.filament).toBeCloseTo(2.98, 1);
    });

    it('counts unpriced filament and still prices the energy', () => {
        const e = estimateCost([{ material: 'PLA', usedG: 12, pricePerG: null }], 7200, {
            defaultPricePerKg: 0,
            costs,
        });
        expect(e).toEqual({ filament: 0, energy: 0.2, total: 0.2, weightG: 12, unpricedG: 12 });
    });

    it('uses the printer power draw over the default one', () => {
        const e = estimateCost([], 3600, { defaultPricePerKg: 0, costs, printer: { powerW: 300 } });
        expect(e?.energy).toBe(0.3);
    });

    it('returns nothing when no price is set', () => {
        const none = { energyPricePerKwh: 0, printerPowerW: 0 };
        expect(
            estimateCost([{ material: 'PLA', usedG: 20, pricePerG: null }], 3600, {
                defaultPricePerKg: 0,
                costs: none,
            }),
        ).toBeNull();
        expect(estimateCost([], 0, { defaultPricePerKg: 50, costs })).toBeNull();
    });
});
