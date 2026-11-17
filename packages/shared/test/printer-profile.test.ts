import { describe, expect, it } from 'bun:test';
import { PRINTER_TAG_MAX, printerProfileSchema, printerSettingsSchema, updatePrinterSchema } from '../src/printer';

describe('printerProfileSchema', () => {
    it('starts empty, with nothing invented', () => {
        expect(printerProfileSchema.parse({})).toEqual({
            location: '',
            tags: [],
            nozzleMm: null,
            powerW: null,
        });
        expect(printerSettingsSchema.parse({}).profile).toEqual(printerProfileSchema.parse({}));
    });

    it('normalises tags to trimmed lowercase and drops duplicates', () => {
        expect(printerProfileSchema.parse({ tags: [' PLA ', 'pla', 'Farm-A'] }).tags).toEqual(['pla', 'farm-a']);
    });

    it('rejects empty, long and too many tags', () => {
        expect(printerProfileSchema.safeParse({ tags: ['  '] }).success).toBe(false);
        expect(printerProfileSchema.safeParse({ tags: ['x'.repeat(33)] }).success).toBe(false);
        const many = Array.from({ length: PRINTER_TAG_MAX + 1 }, (_, i) => `t${i}`);
        expect(printerProfileSchema.safeParse({ tags: many }).success).toBe(false);
    });

    it('bounds the numbers and accepts clearing them', () => {
        expect(printerProfileSchema.safeParse({ nozzleMm: 0.05 }).success).toBe(false);
        expect(printerProfileSchema.safeParse({ powerW: -1 }).success).toBe(false);
        expect(printerProfileSchema.parse({ nozzleMm: 0.6, powerW: null }).nozzleMm).toBe(0.6);
    });

    it('can be patched one field at a time', () => {
        const patch = updatePrinterSchema.parse({ settings: { profile: { location: 'Garage' } } });
        expect(patch.settings?.profile).toEqual({ location: 'Garage' });
    });
});

describe('printerProfileSchema without machine cost', () => {
    it('drops the purchase price and lifespan saved by older versions', () => {
        expect(printerProfileSchema.parse({ powerW: 200, purchasePrice: 3000, lifespanHours: 6000 })).toEqual({
            location: '',
            tags: [],
            nozzleMm: null,
            powerW: 200,
        });
    });
});

describe('queue start settings', () => {
    it('start manually, confirm the bed and wait 15 s before an automatic start by default', () => {
        expect(printerSettingsSchema.parse({})).toMatchObject({
            queueAutoStart: false,
            queueBedClearConfirm: true,
            queueAutoStartDelaySec: 15,
            lightTrigger: false,
        });
    });

    it('accept a wait from 0 to 3600 whole seconds', () => {
        expect(printerSettingsSchema.parse({ queueAutoStartDelaySec: 0 }).queueAutoStartDelaySec).toBe(0);
        expect(printerSettingsSchema.parse({ queueAutoStartDelaySec: 3600 }).queueAutoStartDelaySec).toBe(3600);
        expect(printerSettingsSchema.safeParse({ queueAutoStartDelaySec: -1 }).success).toBe(false);
        expect(printerSettingsSchema.safeParse({ queueAutoStartDelaySec: 3601 }).success).toBe(false);
        expect(printerSettingsSchema.safeParse({ queueAutoStartDelaySec: 1.5 }).success).toBe(false);
    });
});
