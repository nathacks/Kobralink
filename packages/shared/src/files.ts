import { z } from 'zod';
import type { SpoolUsageEntry } from './spools';

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
    objects: string[];
    hasSvg: boolean;
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
    estimatedSec: number;
    filamentMm: number;
    spoolUsage: SpoolUsageEntry[];
    thumbnail: string | null;
}

export const startPrintSchema = z.object({
    fileId: z.string(),
    autoLeveling: z.boolean().optional(),
    excludedObjects: z.array(z.string().min(1)).max(500).default([]),
});

export const skipObjectsSchema = z.object({ names: z.array(z.string().min(1)).min(1).max(500) });
export type SkipObjectsInput = z.infer<typeof skipObjectsSchema>;

export interface FileObjectsDto {
    names: string[];
    svgB64: string;
}

export interface SkipStateDto {
    filename: string;
    objects: string[];
    skipped: string[];
    svgB64: string;
    ts: number;
}
export type StartPrintInput = z.input<typeof startPrintSchema>;

export interface PrinterFileDto {
    filename: string;
    sizeBytes: number;
    timestamp: number;
}

export const deletePrinterFilesSchema = z.object({ filenames: z.array(z.string().min(1)).min(1).max(200) });
export type DeletePrinterFilesInput = z.infer<typeof deletePrinterFilesSchema>;

export const printPrinterFileSchema = z.object({
    filename: z.string().min(1),
    sizeBytes: z.number().int().min(0).default(0),
    autoLeveling: z.boolean().optional(),
});
export type PrintPrinterFileInput = z.input<typeof printPrinterFileSchema>;
