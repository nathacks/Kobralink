import { z } from 'zod';
import { patchSchema } from './patch';

export interface LocalSpoolDto {
    id: string;
    name: string;
    vendor: string;
    material: string;
    colorHex: string;
    initialWeightG: number;
    usedMm: number;
    usedG: number;
    remainingG: number;
    archived: boolean;
    createdAt: string;
    lastUsedAt: string | null;
}

export const DEFAULT_DENSITY: Record<string, number> = {
    PLA: 1.24,
    PETG: 1.27,
    ABS: 1.04,
    ASA: 1.07,
    TPU: 1.21,
    PA: 1.14,
    PC: 1.2,
    HIPS: 1.04,
    PVA: 1.23,
};

export function materialDensity(material: string): number {
    return DEFAULT_DENSITY[material.trim().toUpperCase().split(/[-+ ]/)[0]] ?? 1.24;
}

export const localSpoolSchema = z.object({
    name: z.string().trim().min(1).max(64),
    vendor: z.string().trim().max(64).default(''),
    material: z.string().trim().min(1).max(16),
    colorHex: z
        .string()
        .regex(/^#?[0-9a-fA-F]{6}$/)
        .transform((v) => (v.startsWith('#') ? v : `#${v}`).toUpperCase())
        .default('#808080'),
    initialWeightG: z.number().min(0).max(10000).default(1000),
    usedMm: z.number().min(0).default(0),
    archived: z.boolean().default(false),
});
export type LocalSpoolInput = z.input<typeof localSpoolSchema>;
export const updateLocalSpoolSchema = patchSchema(localSpoolSchema);
export type UpdateLocalSpoolInput = z.input<typeof updateLocalSpoolSchema>;

export const setLocalSpoolMapSchema = z.object({
    slotMap: z.record(z.string(), z.string().nullable()),
});
export type SetLocalSpoolMapInput = z.infer<typeof setLocalSpoolMapSchema>;

export function filamentWeightG(mm: number, diameterMm: number, densityGcm3: number): number {
    const r = diameterMm / 2 / 10;
    const volumeCm3 = Math.PI * r * r * (mm / 10);
    return volumeCm3 * densityGcm3;
}

export interface SpoolUsageEntry {
    slotIndex: number;
    mm: number;
    material: string;
    spoolId: string | null;
    spoolmanId?: number | null;
    weightG?: number;
    pricePerG?: number | null;
}

export interface SpoolmanPricing {
    gramsPerMm: number;
    pricePerG: number | null;
}

export function spoolmanPricing(spool: {
    price?: number;
    initial_weight?: number;
    filament: { price?: number; weight?: number; density?: number; diameter?: number };
}): SpoolmanPricing | null {
    const { density, diameter } = spool.filament;
    if (!(density && density > 0) || !(diameter && diameter > 0)) return null;
    const gramsPerMm = (density * Math.PI * (diameter / 2) ** 2) / 1000;
    const price = spool.price ?? spool.filament.price;
    const weight = spool.initial_weight ?? spool.filament.weight;
    const pricePerG = price !== undefined && price > 0 && weight !== undefined && weight > 0 ? price / weight : null;
    return { gramsPerMm, pricePerG };
}
