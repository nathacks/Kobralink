import { z } from 'zod';

export const appSettingsSchema = z.object({
    spoolmanUrl: z.string().trim().default(''),
    spoolmanSyncRateSec: z.number().int().min(0).max(3600).default(0),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
export const updateAppSettingsSchema = appSettingsSchema.partial();
export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;

export interface SpoolmanFilament {
    id: number;
    name?: string;
    material?: string;
    color_hex?: string;
    vendor?: { id: number; name: string };
}

export interface SpoolmanSpool {
    id: number;
    remaining_weight?: number;
    used_weight?: number;
    remaining_length?: number;
    used_length?: number;
    archived?: boolean;
    location?: string;
    lot_nr?: string;
    filament: SpoolmanFilament;
}

export interface SpoolmanStatus {
    configured: boolean;
    reachable: boolean;
    server: string;
    syncRateSec: number;
    slotSpools: Record<string, number>;
}

export const setSpoolMapSchema = z.object({
    slotMap: z.record(z.string(), z.number().int().min(0)),
});
export type SetSpoolMapInput = z.infer<typeof setSpoolMapSchema>;
