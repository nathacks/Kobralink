import { z } from 'zod';
import { ENERGY_SENSOR_PATTERN, PLUG_SWITCH_PATTERN } from './home-assistant';
import { patchSchema } from './patch';

export const alertSettingsSchema = z.object({
    nozzleMaxC: z.number().int().min(0).max(350).default(300),
    bedMaxC: z.number().int().min(0).max(150).default(110),
    offlineMinutes: z.number().int().min(0).max(1440).default(0),
    spoolLowG: z.number().int().min(0).max(1000).default(0),
});
export type AlertSettings = z.infer<typeof alertSettingsSchema>;

const nullableNumber = (max: number) => z.number().min(0).max(max).nullable().default(null);

export const PRINTER_TAG_MAX = 20;

export const printerTagSchema = z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((v) => v.toLowerCase());

export const printerProfileSchema = z.object({
    location: z.string().trim().max(64).default(''),
    tags: z
        .array(printerTagSchema)
        .max(PRINTER_TAG_MAX)
        .transform((tags) => [...new Set(tags)])
        .default([]),
    nozzleMm: z.number().min(0.1).max(2).nullable().default(null),
    powerW: nullableNumber(5000),
});
export type PrinterProfile = z.infer<typeof printerProfileSchema>;

export const printerSettingsSchema = z.object({
    autoLeveling: z.boolean().default(true),
    vibrationCompensation: z.boolean().default(false),
    flowCalibration: z.boolean().default(true),

    defaultAmsSlot: z.union([z.literal('auto'), z.number().int().min(0).max(15)]).default('auto'),
    pollIntervalSec: z.number().int().min(1).max(60).default(3),
    cameraAlwaysOn: z.boolean().default(true),
    cameraOnPrint: z.boolean().default(false),
    deletePrinterFileAfterPrint: z.boolean().default(false),
    visibleVendors: z.array(z.string().trim().min(1)).default([]),
    powerOnUrl: z.string().trim().default(''),
    powerOffUrl: z.string().trim().default(''),
    powerStatusUrl: z.string().trim().default(''),
    webUploadWarning: z.boolean().default(true),
    printStartDialog: z.boolean().default(true),
    timelapseEnabled: z.boolean().default(false),
    timelapseFps: z.number().int().min(5).max(60).default(15),
    queueAutoStart: z.boolean().default(false),
    queueBedClearConfirm: z.boolean().default(true),
    queueAutoStartDelaySec: z.number().int().min(0).max(3600).default(15),
    failureDetection: z.boolean().default(true),
    lightTrigger: z.boolean().default(false),
    energySensor: z.union([z.literal(''), z.string().trim().regex(ENERGY_SENSOR_PATTERN)]).default(''),
    plugSwitch: z.union([z.literal(''), z.string().trim().regex(PLUG_SWITCH_PATTERN)]).default(''),
    alerts: alertSettingsSchema.default(alertSettingsSchema.parse({})),
    profile: printerProfileSchema.default(printerProfileSchema.parse({})),
});

export const powerActionSchema = z.object({ action: z.enum(['on', 'off']) });
export type PowerActionInput = z.infer<typeof powerActionSchema>;
export type PowerState = 'on' | 'off' | 'unknown';
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
    maintenance: z.boolean().default(false),
    awaitingBedClear: z.boolean().default(false),
    createdAt: z.string(),
});
export type Printer = z.infer<typeof printerSchema>;

export const ipv4 = z
    .string()
    .trim()
    .refine(
        (v) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(v) && v.split('.').every((p) => Number(p) <= 255),
        { params: { i18n: 'ip' } },
    );

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
    settings: patchSchema(printerSettingsSchema).optional(),
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
