import { describe, expect, it } from 'bun:test';
import { jobMaterial } from '../src/stats/job-material';

describe('jobMaterial', () => {
    it('takes the material of the first used filament in the file', () => {
        const filaments = JSON.stringify([
            { material: 'PLA', isUsed: false },
            { material: 'PETG', isUsed: true },
        ]);
        expect(jobMaterial(filaments, 'part.gcode')).toBe('PETG');
    });

    it('falls back to the material in the slicer filename', () => {
        expect(jobMaterial('[]', 'presilha_plate(01)_PETG_0.28_1h27m.gcode')).toBe('PETG');
        expect(jobMaterial(undefined, 'Anti-Wobble V2 (01)_ABS_0.2.gcode')).toBe('ABS');
    });

    it('keeps PLA as the last resort', () => {
        expect(jobMaterial('not json', 'part.gcode')).toBe('PLA');
    });
});
