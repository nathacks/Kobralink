import { describe, expect, it } from 'bun:test';
import { ANYCUBIC_PRINTER_SPECS, printerSpecs } from '../src/printer-specs';

describe('printerSpecs', () => {
    it('finds the official specs of a model by its LAN model id', () => {
        expect(printerSpecs('20028')).toMatchObject({
            name: 'Kobra 4',
            buildVolumeMm: { x: 260, y: 260, z: 260 },
            defaultNozzleMm: 0.4,
            ratedPowerByMainsW: { v110: 475, v220: 1450 },
        });
        expect(printerSpecs('20030')?.ace).toBe('builtin');
    });

    it('returns nothing for an unknown or missing model id', () => {
        expect(printerSpecs('99999')).toBeNull();
        expect(printerSpecs('')).toBeNull();
        expect(printerSpecs(undefined)).toBeNull();
    });

    it('lists each model once, with official sources and consistent values', () => {
        const ids = ANYCUBIC_PRINTER_SPECS.map((s) => s.modeId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const s of ANYCUBIC_PRINTER_SPECS) {
            expect(s.sources.length).toBeGreaterThan(0);
            for (const url of s.sources) expect(url).toMatch(/^https:\/\/(store|wiki)\.anycubic\.com\//);
            if (s.defaultNozzleMm !== null) expect(s.nozzleSizesMm).toContain(s.defaultNozzleMm);
            expect(s.ratedPowerW !== null && s.ratedPowerByMainsW !== null).toBe(false);
        }
    });
});
