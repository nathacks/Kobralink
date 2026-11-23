import { z } from 'zod';

export const homeAssistantApiSettingsSchema = z.object({
    url: z.union([z.literal(''), z.url()]).default(''),
    token: z.string().trim().max(2048).default(''),
});
export type HomeAssistantApiSettings = z.infer<typeof homeAssistantApiSettingsSchema>;

export const homeAssistantTestSchema = z.object({
    url: z.url(),
    token: z.string().trim().min(1).max(2048),
});
export type HomeAssistantTestInput = z.infer<typeof homeAssistantTestSchema>;

export const ENERGY_SENSOR_PATTERN = /^sensor\.[a-z0-9_]+$/;
export const PLUG_SWITCH_PATTERN = /^switch\.[a-z0-9_]+$/;

export interface HaSwitchDto {
    entityId: string;
    name: string;
    on: boolean | null;
}

export interface HaEnergySensorDto {
    entityId: string;
    name: string;
    kwh: number | null;
}

export interface HaTestResultDto {
    ok: boolean;
    message: string;
}

const KWH_FACTOR: Record<string, number> = { wh: 0.001, kwh: 1, mwh: 1000 };

export function isEnergyUnit(unit: string | undefined | null): boolean {
    return (unit ?? '').toLowerCase() in KWH_FACTOR;
}

export function toKwh(state: string | number | null | undefined, unit: string | undefined | null): number | null {
    const factor = KWH_FACTOR[(unit ?? '').toLowerCase()];
    if (factor === undefined) return null;
    const value = typeof state === 'number' ? state : Number.parseFloat(String(state ?? ''));
    if (!Number.isFinite(value)) return null;
    return value * factor;
}

export function measuredKwh(startKwh: number | null, endKwh: number | null): number | null {
    if (startKwh === null || endKwh === null) return null;
    const used = endKwh - startKwh;
    if (used < 0) return null;
    return Math.round(used * 1000) / 1000;
}
