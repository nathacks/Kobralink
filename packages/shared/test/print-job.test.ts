import { describe, expect, it } from 'bun:test';
import { cancelPrintSchema, FAILURE_REASONS, updatePrintJobSchema } from '../src/files';

describe('updatePrintJobSchema', () => {
    it('accepts every failure reason, an empty reason and a trimmed note', () => {
        for (const reason of FAILURE_REASONS) {
            expect(updatePrintJobSchema.parse({ failureReason: reason })).toEqual({ failureReason: reason });
        }
        expect(updatePrintJobSchema.parse({ failureReason: '', note: '  bed too cold  ' })).toEqual({
            failureReason: '',
            note: 'bed too cold',
        });
        expect(updatePrintJobSchema.parse({})).toEqual({});
    });

    it('rejects unknown reasons and overlong notes', () => {
        expect(updatePrintJobSchema.safeParse({ failureReason: 'gremlins' }).success).toBe(false);
        expect(updatePrintJobSchema.safeParse({ note: 'x'.repeat(501) }).success).toBe(false);
        expect(updatePrintJobSchema.safeParse({ note: 'x'.repeat(500) }).success).toBe(true);
    });

    it('lists the agreed reasons', () => {
        expect([...FAILURE_REASONS]).toEqual([
            'spaghetti',
            'adhesion',
            'clog',
            'filament_runout',
            'layer_shift',
            'power_loss',
            'user_cancel',
            'quality',
            'other',
        ]);
    });
});

describe('cancelPrintSchema', () => {
    it('takes an optional reason and defaults to none', () => {
        expect(cancelPrintSchema.parse({ reason: 'spaghetti' })).toEqual({ reason: 'spaghetti' });
        expect(cancelPrintSchema.parse({})).toEqual({ reason: '' });
        expect(cancelPrintSchema.parse(undefined)).toEqual({ reason: '' });
    });

    it('rejects an unknown reason', () => {
        expect(cancelPrintSchema.safeParse({ reason: 'gremlins' }).success).toBe(false);
    });
});
