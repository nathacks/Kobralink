import { describe, expect, it } from 'bun:test';
import { PRINT_OPTION_FEATURES, readFeatures, supportsPrintOption } from '../src/features';

const kobra4 = {
    auto_leveling_support: true,
    camera_timelapse_support: true,
    delete_batch_support: true,
    drying_first_support: false,
    flow_calibration_support: true,
    fod_support: true,
    gcode_3mf_support: true,
    keep_print_head_temp_support: true,
    pre_cancel_support: true,
    preheating_support: true,
    shengwang_rdt_support: true,
    shengwang_rtc_support: true,
    vibration_compensation_support: true,
};

describe('readFeatures', () => {
    it('keeps the flags the Kobra 4 reports', () => {
        expect(readFeatures(kobra4)).toEqual(kobra4);
    });

    it('reads 1 and 0 as flags and drops values that are not flags', () => {
        expect(
            readFeatures({ auto_leveling_support: 1, fod_support: 0, version: '2.1', camera_timelapse_support: null }),
        ).toEqual({ auto_leveling_support: true, fod_support: false });
    });

    it('returns nothing when the printer reports no features object', () => {
        expect(readFeatures(undefined)).toBeNull();
        expect(readFeatures(null)).toBeNull();
        expect(readFeatures('auto_leveling_support')).toBeNull();
        expect(readFeatures([true])).toBeNull();
    });

    it('returns an empty set for an empty features object', () => {
        expect(readFeatures({})).toEqual({});
    });
});

describe('supportsPrintOption', () => {
    it('offers every option while the printer has not reported its features', () => {
        for (const option of Object.keys(PRINT_OPTION_FEATURES) as (keyof typeof PRINT_OPTION_FEATURES)[]) {
            expect(supportsPrintOption(null, option)).toBe(true);
            expect(supportsPrintOption(undefined, option)).toBe(true);
        }
    });

    it('offers the three options on the Kobra 4', () => {
        const features = readFeatures(kobra4);
        expect(supportsPrintOption(features, 'autoLeveling')).toBe(true);
        expect(supportsPrintOption(features, 'vibrationCompensation')).toBe(true);
        expect(supportsPrintOption(features, 'flowCalibration')).toBe(true);
    });

    it('hides an option the printer reports as unsupported', () => {
        const features = readFeatures({ ...kobra4, flow_calibration_support: false });
        expect(supportsPrintOption(features, 'flowCalibration')).toBe(false);
        expect(supportsPrintOption(features, 'autoLeveling')).toBe(true);
    });

    it('hides an option missing from the features the printer reports', () => {
        const features = readFeatures({ auto_leveling_support: true });
        expect(supportsPrintOption(features, 'autoLeveling')).toBe(true);
        expect(supportsPrintOption(features, 'vibrationCompensation')).toBe(false);
        expect(supportsPrintOption(features, 'flowCalibration')).toBe(false);
    });
});
