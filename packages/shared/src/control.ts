import { z } from 'zod';

export const setTemperatureSchema = z
    .object({
        nozzle: z.number().min(0).max(320).optional(),
        bed: z.number().min(0).max(120).optional(),
    })
    .refine((v) => v.nozzle !== undefined || v.bed !== undefined, 'nozzle ou bed requis');

export const setFanSchema = z.object({ speed: z.number().int().min(0).max(100) });
export const setLightSchema = z.object({
    on: z.boolean(),
    brightness: z.number().int().min(0).max(100).optional(),
});
export const setSpeedSchema = z.object({ mode: z.number().int().min(1).max(3) });

export const moveAxisSchema = z.object({
    axis: z.number().int().min(1).max(4),
    moveType: z.number().int().min(0).max(2),
    distance: z.number().min(0).max(100).default(0),
});

export const AMS_MATERIALS = [
    'PLA',
    'PLA+',
    'PLA-CF',
    'PETG',
    'PETG-CF',
    'ABS',
    'ASA',
    'TPU',
    'PA',
    'PA-CF',
    'PC',
    'HIPS',
    'PVA',
] as const;

const rgb = z.tuple([
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
]);

export const amsSetSlotSchema = z.object({
    index: z.number().int().min(0).max(19),
    type: z
        .string()
        .trim()
        .min(1)
        .max(16)
        .transform((v) => v.toUpperCase()),
    color: rgb,
});
export const amsFeedSchema = z.object({
    slotIndex: z.number().int().min(0).max(19),
    type: z.union([z.literal(1), z.literal(2)]),
});
export const aceAutoFeedSchema = z.object({
    aceId: z.number().int().min(0).max(3),
    on: z.boolean(),
});
export const aceDrySchema = z.object({
    action: z.enum(['start', 'stop']),
    aceId: z.number().int().min(0).max(3).optional(),
    targetTemp: z.number().int().min(30).max(80).default(45),
    duration: z.number().int().min(10).max(1440).default(240),
});

export type SetTemperatureInput = z.infer<typeof setTemperatureSchema>;
export type SetFanInput = z.infer<typeof setFanSchema>;
export type SetLightInput = z.infer<typeof setLightSchema>;
export type SetSpeedInput = z.infer<typeof setSpeedSchema>;
export type MoveAxisInput = z.infer<typeof moveAxisSchema>;
export type AmsSetSlotInput = z.input<typeof amsSetSlotSchema>;
export type AmsFeedInput = z.infer<typeof amsFeedSchema>;
export type AceAutoFeedInput = z.infer<typeof aceAutoFeedSchema>;
export type AceDryInput = z.input<typeof aceDrySchema>;
