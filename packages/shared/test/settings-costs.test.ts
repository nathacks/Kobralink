import { describe, expect, it } from 'bun:test';
import { printerSettingsSchema } from '../src/printer';
import { APP_LOCALES, appSettingsSchema, costSettingsSchema } from '../src/settings';
import { materialDensity, spoolmanPricing } from '../src/spools';

describe('cost settings', () => {
    it('default to zero so no cost is shown until the user sets a price', () => {
        expect(costSettingsSchema.parse({})).toEqual({ energyPricePerKwh: 0, printerPowerW: 0 });
        expect(appSettingsSchema.parse({}).costs).toEqual({ energyPricePerKwh: 0, printerPowerW: 0 });
    });

    it('accept realistic values and reject negative or absurd ones', () => {
        expect(costSettingsSchema.parse({ energyPricePerKwh: 0.21, printerPowerW: 180 })).toEqual({
            energyPricePerKwh: 0.21,
            printerPowerW: 180,
        });
        expect(costSettingsSchema.safeParse({ energyPricePerKwh: -1 }).success).toBe(false);
        expect(costSettingsSchema.safeParse({ printerPowerW: 6000 }).success).toBe(false);
    });

    it('drop the machine rate saved by older versions', () => {
        expect(costSettingsSchema.parse({ printerPowerW: 120, hourlyRate: 2 })).toEqual({
            energyPricePerKwh: 0,
            printerPowerW: 120,
        });
    });

    it('survive a partial patch of the app settings', () => {
        const parsed = appSettingsSchema.parse({ costs: { printerPowerW: 120 } });
        expect(parsed.costs).toEqual({ energyPricePerKwh: 0, printerPowerW: 120 });
    });
});

describe('locales', () => {
    it('include Brazilian Portuguese with French as the default', () => {
        expect(APP_LOCALES).toContain('pt-br');
        expect(APP_LOCALES[0]).toBe('fr');
        expect(appSettingsSchema.parse({}).locale).toBe('fr');
        expect(appSettingsSchema.parse({ locale: 'pt-br' }).locale).toBe('pt-br');
        expect(appSettingsSchema.safeParse({ locale: 'pt' }).success).toBe(false);
    });
});

describe('notification events', () => {
    it('turn the scheduled print and maintenance events on by default', () => {
        const events = appSettingsSchema.parse({}).notifications.events;
        expect(events.scheduledPrint).toBe(true);
        expect(events.maintenanceDue).toBe(true);
        const off = appSettingsSchema.parse({ notifications: { events: { maintenanceDue: false } } });
        expect(off.notifications.events.maintenanceDue).toBe(false);
        expect(off.notifications.events.scheduledPrint).toBe(true);
    });
});

describe('printer settings', () => {
    it('ask for a bed-clear confirmation by default', () => {
        expect(printerSettingsSchema.parse({}).queueBedClearConfirm).toBe(true);
        expect(printerSettingsSchema.parse({ queueBedClearConfirm: false }).queueBedClearConfirm).toBe(false);
    });
});

describe('spoolmanPricing', () => {
    const filament = { density: 1.24, diameter: 1.75, price: 20, weight: 1000 };

    it('weighs a millimetre with the filament density and diameter', () => {
        expect(spoolmanPricing({ filament })?.gramsPerMm).toBeCloseTo(0.002982, 5);
    });

    it('prices a gram from the spool, falling back to the filament', () => {
        expect(spoolmanPricing({ filament })?.pricePerG).toBe(0.02);
        expect(spoolmanPricing({ price: 30, initial_weight: 750, filament })?.pricePerG).toBe(0.04);
        expect(spoolmanPricing({ price: 30, filament })?.pricePerG).toBe(0.03);
    });

    it('leaves the price unknown without a price or a weight', () => {
        expect(spoolmanPricing({ filament: { density: 1.24, diameter: 1.75 } })?.pricePerG).toBeNull();
        expect(spoolmanPricing({ price: 0, filament: { ...filament, price: 0 } })?.pricePerG).toBeNull();
    });

    it('cannot weigh without the density or the diameter', () => {
        expect(spoolmanPricing({ filament: { diameter: 1.75 } })).toBeNull();
        expect(spoolmanPricing({ filament: { density: 1.24 } })).toBeNull();
    });
});

describe('materialDensity', () => {
    it('uses the density of the material family', () => {
        expect(materialDensity('PETG')).toBe(1.27);
        expect(materialDensity('petg-cf')).toBe(1.27);
        expect(materialDensity('PLA+')).toBe(1.24);
        expect(materialDensity('Mystery')).toBe(1.24);
    });
});
