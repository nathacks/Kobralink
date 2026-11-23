import { FAILURE_REASONS, PREPARING_KOBRA_STATES, PRINTER_ERROR_CODES } from '@kobralink/shared';
import { describe, expect, it } from 'vitest';
import { m } from './i18n';
import { AMS_ACTIVITY_LABEL, failureReasonLabel, kobraStateLabel, printerErrorText } from './labels';

describe('failureReasonLabel', () => {
    it('translates every reason and the special buckets', () => {
        const labels = FAILURE_REASONS.map(failureReasonLabel);
        expect(new Set(labels).size).toBe(FAILURE_REASONS.length);
        for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
        expect(failureReasonLabel('spaghetti')).toBe(m.failure_reason_spaghetti());
        expect(failureReasonLabel('')).toBe(m.failure_reason_none());
        expect(failureReasonLabel('unlabeled')).toBe(m.failure_reason_none());
        expect(failureReasonLabel('error')).toBe(m.failure_reason_error());
    });

    it('falls back to the raw value for an unknown reason', () => {
        expect(failureReasonLabel('gremlins')).toBe('gremlins');
    });
});

describe('kobraStateLabel', () => {
    it('translates every preparation step the printer reports', () => {
        for (const state of PREPARING_KOBRA_STATES) {
            const label = kobraStateLabel(state);
            expect(label).not.toBe(state);
            expect(label.trim().length).toBeGreaterThan(0);
        }
    });

    it('names flow calibration and the filament steps', () => {
        expect(kobraStateLabel('flow_calibrating')).toBe(m.state_flow_calibrating());
        expect(kobraStateLabel('ace_filament_feeding')).toBe(m.state_filament_loading());
        expect(kobraStateLabel('extfilbox_filament_unfeeding')).toBe(m.state_filament_unloading());
        expect(kobraStateLabel('nozzle_cooling_off')).toBe(m.state_nozzle_cooling());
    });

    it('falls back to the raw value for an unknown state', () => {
        expect(kobraStateLabel('brand_new_state')).toBe('brand_new_state');
    });
});

describe('AMS_ACTIVITY_LABEL', () => {
    it('labels every slot activity the bridge reports', () => {
        expect(AMS_ACTIVITY_LABEL.heating()).toBe(m.ams_activity_heating());
        expect(AMS_ACTIVITY_LABEL.feeding()).toBe(m.ams_activity_feeding());
        expect(AMS_ACTIVITY_LABEL.retracting()).toBe(m.ams_activity_retracting());
        expect(AMS_ACTIVITY_LABEL.loaded()).toBe(m.ams_activity_loaded());
    });
});

describe('printerErrorText', () => {
    it('translates every mapped printer code', () => {
        for (const code of PRINTER_ERROR_CODES) {
            const text = printerErrorText(code, 'raw printer message');
            expect(text).not.toBe('raw printer message');
            expect(text.trim().length).toBeGreaterThan(0);
        }
    });

    it('uses the same text for a code sent as a string', () => {
        expect(printerErrorText('10402', 'Insufficient supplies')).toBe(m.printer_error_out_of_filament());
    });

    it('keeps the printer message for an unknown code', () => {
        expect(printerErrorText(19999, 'Something new')).toBe('Something new');
        expect(printerErrorText('?', 'No reply')).toBe('No reply');
        expect(printerErrorText(0, '')).toBe('');
    });
});
