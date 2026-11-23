import { describe, expect, it } from 'vitest';
import { parseFilename } from './filename';

describe('parseFilename', () => {
    it('drops the upload stamp, the plate suffix and the extension', () => {
        expect(parseFilename('20261022-173630-5U+Lab+Rax+X2D_plate(03)_PETG_0.2_2h3m.gcode')).toEqual({
            name: '5U Lab Rax X2D',
            plate: 3,
        });
    });

    it('keeps names without a plate and removes the slicer suffix', () => {
        expect(parseFilename('keyboard+switch+tester+5x5_PLA_0.24_23m59s.gcode')).toEqual({
            name: 'keyboard switch tester 5x5',
            plate: null,
        });
    });

    it('handles 3MF G-code exports and folders', () => {
        expect(parseFilename('/usb/stand_pegboard_plate(01)_PETG_0.2_5h23m.gcode.3mf')).toEqual({
            name: 'stand pegboard',
            plate: 1,
        });
    });

    it('leaves a plain name alone', () => {
        expect(parseFilename('Calibration cube.gcode')).toEqual({ name: 'Calibration cube', plate: null });
    });

    it('never returns an empty name', () => {
        expect(parseFilename('.gcode').name).toBe('.gcode');
    });
});
