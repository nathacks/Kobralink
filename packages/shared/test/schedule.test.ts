import { describe, expect, it } from 'bun:test';
import { schedulePrintSchema } from '../src/schedule';

describe('schedulePrintSchema', () => {
    it('accepts the print options plus a parseable start time', () => {
        const parsed = schedulePrintSchema.parse({
            fileId: 'f1',
            startAt: '2026-11-01T08:00:00.000Z',
            excludedObjects: ['cube'],
            timelapse: true,
        });
        expect(parsed).toMatchObject({
            fileId: 'f1',
            startAt: '2026-11-01T08:00:00.000Z',
            excludedObjects: ['cube'],
            timelapse: true,
        });
    });

    it('keeps the flow calibration choice for the scheduled start', () => {
        const parsed = schedulePrintSchema.parse({
            fileId: 'f1',
            startAt: '2026-11-01T08:00:00.000Z',
            flowCalibration: false,
        });
        expect(parsed.flowCalibration).toBe(false);
    });

    it('rejects a missing or unparseable start time', () => {
        expect(schedulePrintSchema.safeParse({ fileId: 'f1' }).success).toBe(false);
        expect(schedulePrintSchema.safeParse({ fileId: 'f1', startAt: 'tomorrow' }).success).toBe(false);
        expect(schedulePrintSchema.safeParse({ fileId: 'f1', startAt: '' }).success).toBe(false);
    });

    it('still requires a file', () => {
        expect(schedulePrintSchema.safeParse({ startAt: '2026-11-01T08:00:00.000Z' }).success).toBe(false);
    });
});
