import { z } from 'zod';
import { materialFamily } from './filament';
import { startPrintSchema } from './files';
import { printerTagSchema } from './printer';

export const QUEUE_WAIT_REASONS = [
    'no_printer',
    'busy',
    'bed_clear',
    'maintenance',
    'offline',
    'filament',
    'manual',
] as const;
export type QueueWaitReason = (typeof QUEUE_WAIT_REASONS)[number];

export interface QueueItemDto {
    id: string;
    printerId: string | null;
    targetTags: string[];
    fileId: string;
    filename: string;
    thumbnail: string | null;
    estPrintTimeSec: number;
    position: number;
    excludedObjects: string[];
    options: QueuePrintOptions;
    createdAt: string;
    waiting: QueueWaitReason | null;
    candidates: string[];
}

export const queuePrintOptionsSchema = startPrintSchema.omit({ fileId: true, excludedObjects: true });
export type QueuePrintOptions = z.input<typeof queuePrintOptionsSchema>;

export const addQueueItemSchema = startPrintSchema.extend({
    fileId: z.string().min(1),
    printerId: z.string().min(1).nullable().optional(),
    targetTags: z.array(printerTagSchema).max(10).optional(),
});
export type AddQueueItemInput = z.input<typeof addQueueItemSchema>;

export const reorderQueueSchema = z.object({ ids: z.array(z.string().min(1)).max(500) });
export type ReorderQueueInput = z.infer<typeof reorderQueueSchema>;

export const bedClearSchema = z.object({ outcome: z.enum(['good', 'bad']).default('good') });
export type BedClearInput = z.input<typeof bedClearSchema>;

export const maintenanceModeSchema = z.object({ enabled: z.boolean() });
export type MaintenanceModeInput = z.infer<typeof maintenanceModeSchema>;

export const queueCheckSchema = z.object({
    fileId: z.string().min(1),
    printerId: z.string().min(1).nullable().optional(),
    targetTags: z.array(printerTagSchema).max(10).optional(),
});
export type QueueCheckInput = z.input<typeof queueCheckSchema>;

export interface QueueStatusDto {
    awaitingBedClear: boolean;
    maintenance: boolean;
    nextFilename: string | null;
    autoStartAt: string | null;
}

export interface BedClearResultDto {
    started: QueueItemDto | null;
    startsAt: string | null;
}

export const COMPAT_REASONS = ['target', 'model', 'nozzle', 'size', 'material', 'color'] as const;
export type CompatReason = (typeof COMPAT_REASONS)[number];

export const SOFT_COMPAT_REASONS: readonly CompatReason[] = ['color'];

export function blockingReasons(reasons: CompatReason[]): CompatReason[] {
    return reasons.filter((r) => !SOFT_COMPAT_REASONS.includes(r));
}

export interface PrinterCompatDto {
    printerId: string;
    name: string;
    reasons: CompatReason[];
}

export interface QueueCheckDto {
    ok: boolean;
    printers: PrinterCompatDto[];
}

export interface QueueTarget {
    printerId: string | null;
    targetTags: string[];
}

export interface FileTargetInfo {
    printerModel: string;
    nozzleMm: number | null;
    bedX: number | null;
    bedY: number | null;
    extentX: number | null;
    extentY: number | null;
    maxZ: number | null;
}

export interface PrinterTargetInfo {
    id: string;
    model: string;
    tags: string[];
    nozzleMm: number | null;
    buildVolumeMm: { x: number; y: number; z: number } | null;
}

export interface StockFilament {
    material: string;
    colorHex: string;
}

export function normalizeModel(model: string): string {
    return model
        .toLowerCase()
        .replace(/anycubic/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

export function isTargeted(target: QueueTarget, printer: Pick<PrinterTargetInfo, 'id' | 'tags'>): boolean {
    if (target.printerId) return target.printerId === printer.id;
    return target.targetTags.every((tag) => printer.tags.includes(tag));
}

export function staticReasons(file: FileTargetInfo, printer: PrinterTargetInfo): CompatReason[] {
    const reasons: CompatReason[] = [];
    if (file.printerModel && normalizeModel(file.printerModel) !== normalizeModel(printer.model)) {
        reasons.push('model');
    }
    if (file.nozzleMm !== null && printer.nozzleMm !== null && Math.abs(file.nozzleMm - printer.nozzleMm) > 0.001) {
        reasons.push('nozzle');
    }
    const bed = printer.buildVolumeMm;
    if (bed) {
        const x = file.extentX ?? file.bedX;
        const y = file.extentY ?? file.bedY;
        if ((x !== null && x > bed.x + 0.5) || (y !== null && y > bed.y + 0.5) || (file.maxZ ?? 0) > bed.z) {
            reasons.push('size');
        }
    }
    return reasons;
}

export function hexDistance(a: string, b: string): number {
    const rgb = (hex: string) => {
        const h = hex.replace(/^#/, '').padEnd(6, '0');
        return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) || 0);
    };
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export const COLOR_TOLERANCE = 80;

export function stockReasons(used: StockFilament[], stock: StockFilament[] | null): CompatReason[] {
    if (!stock || stock.length === 0) return [];
    const reasons = new Set<CompatReason>();
    for (const need of used) {
        const family = materialFamily(need.material);
        const sameMaterial = stock.filter((s) => !family || materialFamily(s.material) === family);
        if (!sameMaterial.length) {
            reasons.add('material');
            continue;
        }
        if (!sameMaterial.some((s) => !s.colorHex || hexDistance(s.colorHex, need.colorHex) <= COLOR_TOLERANCE)) {
            reasons.add('color');
        }
    }
    return [...reasons];
}
