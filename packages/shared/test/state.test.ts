import { describe, expect, it } from 'bun:test';
import {
    ACTIVE_PRINT_STATES,
    isCalibrating,
    isPreparing,
    KOBRA_TO_KLIPPER_STATE,
    PRE_PRINT_STATES,
    PREPARING_KOBRA_STATES,
    TERMINAL_PRINT_STATES,
} from '../src/state';

describe('isCalibrating', () => {
    it('is true while a print levels, compensates vibrations or heats up', () => {
        for (const kobraState of ['auto_leveling', 'vibrating', 'preheating', 'checking']) {
            expect(isCalibrating({ printState: 'printing', kobraState })).toBe(true);
        }
    });

    it('is false once the print really runs, or outside a print', () => {
        expect(isCalibrating({ printState: 'printing', kobraState: 'printing' })).toBe(false);
        expect(isCalibrating({ printState: 'standby', kobraState: 'preheating' })).toBe(false);
        expect(isCalibrating({ printState: 'paused', kobraState: 'paused' })).toBe(false);
    });

    it('is true before the first layer and false once a layer was printed', () => {
        expect(isCalibrating({ printState: 'printing', kobraState: 'flow_calibrating', currLayer: 0 })).toBe(true);
        expect(isCalibrating({ printState: 'printing', kobraState: 'filament_cutting', currLayer: 0 })).toBe(true);
        expect(isCalibrating({ printState: 'printing', kobraState: 'filament_cutting', currLayer: 42 })).toBe(false);
        expect(isCalibrating({ printState: 'printing', kobraState: 'updated', currLayer: 12 })).toBe(false);
    });
});

describe('isPreparing', () => {
    it('only counts preparation steps before the first layer', () => {
        expect(isPreparing('flow_calibrating')).toBe(true);
        expect(isPreparing('nozzle_wiping', 0)).toBe(true);
        expect(isPreparing('nozzle_wiping', 3)).toBe(false);
        expect(isPreparing('printing')).toBe(false);
        expect(isPreparing('paused')).toBe(false);
        expect(isPreparing('brand_new_state')).toBe(false);
    });
});

describe('vibration compensation', () => {
    it('counts as part of an active print, before printing starts', () => {
        expect(KOBRA_TO_KLIPPER_STATE.vibrating).toBe('printing');
        expect(PRE_PRINT_STATES.has('vibrating')).toBe(true);
        expect(ACTIVE_PRINT_STATES.has('vibrating')).toBe(true);
    });
});

describe('preparation states reported by the printer', () => {
    const official = ['flow_calibrating', 'drying', 'downloading', 'slicing', 'waiting'];
    const newerFirmware = [
        'hotbed_heating',
        'hotbed_cooling_off',
        'nozzle_heating',
        'nozzle_cooling',
        'nozzle_cooling_off',
        'nozzle_purging',
        'nozzle_wiping',
        'frequency_sweeping',
        'z_offset_calibrating',
        'filament_cutting',
        'extfilbox_filament_feeding',
        'extfilbox_filament_unfeeding',
        'ace_filament_feeding',
        'ace_filament_unfeeding',
    ];

    it('map every official and newer firmware step to an active print', () => {
        for (const kobraState of [...official, ...newerFirmware]) {
            expect(KOBRA_TO_KLIPPER_STATE[kobraState]).toBe('printing');
            expect(PRE_PRINT_STATES.has(kobraState)).toBe(true);
            expect(ACTIVE_PRINT_STATES.has(kobraState)).toBe(true);
        }
    });

    it('keep every preparation state in the shared list', () => {
        expect([...PRE_PRINT_STATES].sort()).toEqual([...PREPARING_KOBRA_STATES].sort());
        expect(new Set(PREPARING_KOBRA_STATES).size).toBe(PREPARING_KOBRA_STATES.length);
    });

    it('do not treat the print update acknowledgement as a new active print', () => {
        expect(PRE_PRINT_STATES.has('updated')).toBe(true);
        expect(ACTIVE_PRINT_STATES.has('updated')).toBe(false);
        expect(ACTIVE_PRINT_STATES.has('printing')).toBe(true);
    });

    it('never overlap with the terminal states', () => {
        for (const kobraState of PREPARING_KOBRA_STATES) expect(TERMINAL_PRINT_STATES.has(kobraState)).toBe(false);
    });
});
