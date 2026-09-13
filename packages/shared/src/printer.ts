import { z } from 'zod';

export const printerSettingsSchema = z.object({
    autoLeveling: z.boolean().default(true),
    vibrationCompensation: z.boolean().default(false),

    defaultAmsSlot: z.union([z.literal('auto'), z.number().int().min(0).max(15)]).default('auto'),
    pollIntervalSec: z.number().int().min(1).max(60).default(3),
    cameraOnPrint: z.boolean().default(false),
    deletePrinterFileAfterPrint: z.boolean().default(false),
    visibleVendors: z.array(z.string().trim().min(1)).default([]),
});
export type PrinterSettings = z.infer<typeof printerSettingsSchema>;

export const printerSchema = z.object({
    id: z.string(),
    name: z.string(),
    ip: z.string(),
    mqttPort: z.number().int(),
    username: z.string(),
    deviceId: z.string(),
    modeId: z.string(),
    model: z.string(),
    httpPort: z.number().int(),
    settings: printerSettingsSchema,
    createdAt: z.string(),
});
export type Printer = z.infer<typeof printerSchema>;

export const ipv4 = z
    .string()
    .trim()
    .regex(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/, 'Adresse IP invalide')
    .refine((v) => v.split('.').every((p) => Number(p) <= 255), 'Adresse IP invalide');

export const addPrinterSchema = z.object({
    ip: ipv4,
    name: z.string().trim().min(1).max(64).optional(),
    httpPort: z.number().int().min(1024).max(65535).optional(),
});
export type AddPrinterInput = z.infer<typeof addPrinterSchema>;

export const updatePrinterSchema = z.object({
    name: z.string().trim().min(1).max(64).optional(),
    ip: ipv4.optional(),
    httpPort: z.number().int().min(1024).max(65535).optional(),
    settings: printerSettingsSchema.partial().optional(),
});
export type UpdatePrinterInput = z.infer<typeof updatePrinterSchema>;

export const printerCredentialsSchema = z.object({
    printerIp: z.string(),
    username: z.string(),
    password: z.string(),
    deviceId: z.string(),
    modeId: z.string(),
    model: z.string(),
});
export type PrinterCredentials = z.infer<typeof printerCredentialsSchema>;
