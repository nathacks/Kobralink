import { z } from 'zod';
import { startPrintSchema } from './files';

export interface ScheduledPrintDto {
    id: string;
    printerId: string;
    fileId: string;
    filename: string;
    thumbnail: string | null;
    estPrintTimeSec: number;
    startAt: string;
    excludedObjects: string[];
    createdAt: string;
}

export const schedulePrintSchema = startPrintSchema.extend({
    startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { params: { i18n: 'date' } }),
});
export type SchedulePrintInput = z.input<typeof schedulePrintSchema>;
