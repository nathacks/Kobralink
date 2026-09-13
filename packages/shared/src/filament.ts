import { z } from 'zod';

export interface FilamentProfile {
    id: string;
    name: string;
    vendor: string;
    type: string;
    color: string;
    isUser?: boolean;
}

export interface SlotProfileRef {
    vendor: string;
    name: string;
    id: string;
}

export interface SlotFilamentInfo {
    slotIndex: number;
    material: string;
    colorHex: string;
    status: 'loaded' | 'empty';
    profile: SlotProfileRef | null;
    override: SlotProfileRef | null;
    source: 'manual' | 'rfid' | 'none';
}

export interface ImportProfilesResult {
    added: number;
    skipped: number;
    totalUser: number;
}

export const setSlotProfileSchema = z.object({
    vendor: z.string().trim().max(64).default(''),
    name: z.string().trim().max(128).default(''),
});
export type SetSlotProfileInput = z.input<typeof setSlotProfileSchema>;

const MATERIAL_ALIASES: Record<string, string> = {
    PLAPLUS: 'PLA+',
    'PLA PLUS': 'PLA+',
    'SILK PLA': 'PLA SILK',
    PLASILK: 'PLA SILK',
    TPE: 'TPU',
    'PETG PLUS': 'PETG+',
    PA6: 'PA',
    PA12: 'PA',
    PA66: 'PA',
};

export function normalizeMaterial(mat: string): string {
    const m = mat.toUpperCase().trim().replace(/[-_]/g, ' ');
    return MATERIAL_ALIASES[m] ?? m;
}

export function materialFamily(mat: string): string {
    if (!mat) return '';
    const m = normalizeMaterial(mat);
    for (const fam of ['PETG', 'PLA', 'ABS', 'ASA', 'TPU', 'PVA', 'HIPS', 'PA', 'PC', 'PET']) {
        if (m.startsWith(fam)) return fam;
    }
    return m;
}
