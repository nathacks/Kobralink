import { describe, expect, it } from 'bun:test';
import { addQueueItemSchema, queuePrintOptionsSchema } from '../src/queue';

describe('addQueueItemSchema', () => {
    it('accepts a file alone and defaults the excluded objects', () => {
        expect(addQueueItemSchema.parse({ fileId: 'f1' })).toEqual({ fileId: 'f1', excludedObjects: [] });
    });

    it('keeps the print options chosen in the dialog', () => {
        expect(
            addQueueItemSchema.parse({
                fileId: 'f1',
                excludedObjects: ['cube'],
                autoLeveling: false,
                vibrationCompensation: false,
                timelapse: true,
                failureDetection: false,
                filamentAssignments: [{ paintIndex: 1, slotIndex: 3 }],
            }),
        ).toEqual({
            fileId: 'f1',
            excludedObjects: ['cube'],
            autoLeveling: false,
            vibrationCompensation: false,
            timelapse: true,
            failureDetection: false,
            filamentAssignments: [{ paintIndex: 1, slotIndex: 3, isUsed: true }],
        });
    });

    it('rejects an empty file id and invalid options', () => {
        expect(addQueueItemSchema.safeParse({ fileId: '' }).success).toBe(false);
        expect(addQueueItemSchema.safeParse({ fileId: 'f1', vibrationCompensation: 'off' }).success).toBe(false);
    });
});

describe('queuePrintOptionsSchema', () => {
    it('leaves out the file and the excluded objects', () => {
        expect(queuePrintOptionsSchema.parse({ fileId: 'f1', excludedObjects: ['cube'], timelapse: true })).toEqual({
            timelapse: true,
        });
    });
});

describe('flow calibration in the queue', () => {
    it('keeps the choice made in the print dialog with the queued item', () => {
        expect(queuePrintOptionsSchema.parse({ flowCalibration: false })).toEqual({ flowCalibration: false });
        expect(addQueueItemSchema.parse({ fileId: 'f1', flowCalibration: false }).flowCalibration).toBe(false);
    });

    it('leaves it to the printer setting when the dialog says nothing', () => {
        expect(queuePrintOptionsSchema.parse({}).flowCalibration).toBeUndefined();
    });
});
