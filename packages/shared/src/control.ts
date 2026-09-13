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
export const setSpeedSchema = z.object({ mode: z.number().int().min(1).max(4) });

export const moveAxisSchema = z.object({
    axis: z.number().int().min(1).max(4),
    moveType: z.number().int().min(0).max(2),
    distance: z.number().min(0).max(100).default(0),
});

export type SetTemperatureInput = z.infer<typeof setTemperatureSchema>;
export type SetFanInput = z.infer<typeof setFanSchema>;
export type SetLightInput = z.infer<typeof setLightSchema>;
export type SetSpeedInput = z.infer<typeof setSpeedSchema>;
export type MoveAxisInput = z.infer<typeof moveAxisSchema>;
