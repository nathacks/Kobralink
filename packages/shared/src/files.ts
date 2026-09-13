import { z } from 'zod';

export interface GcodeFilament {
    slotIndex: number;
    colorHex: string;
    material: string;
    isUsed: boolean;
}

export interface GcodeFileDto {
    id: string;
    printerId: string | null;
    filename: string;
    sizeBytes: number;
    md5: string;
    estPrintTimeSec: number;
    layerHeight: number;
    firstLayerHeight: number;
    thumbnail: string | null;
    filaments: GcodeFilament[];
    webUnverified: boolean;
    createdAt: string;
    lastJob: { status: string; startedAt: string; durationSec: number | null } | null;
}

export interface PrintJobDto {
    id: string;
    printerId: string;
    fileId: string | null;
    filename: string;
    status: 'printing' | 'completed' | 'cancelled' | 'error';
    startedAt: string;
    finishedAt: string | null;
    durationSec: number | null;
}

export const startPrintSchema = z.object({
    fileId: z.string(),
    autoLeveling: z.boolean().optional(),
});
export type StartPrintInput = z.infer<typeof startPrintSchema>;
