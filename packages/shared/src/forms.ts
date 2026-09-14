import { z } from 'zod';
import { addPrinterSchema, ipv4, printerSettingsSchema } from './printer';

export const loginFormSchema = z.object({
    name: z.string().trim().max(64),
    email: z.email(),
    password: z.string().min(8),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const addPrinterFormSchema = z.object({
    ip: addPrinterSchema.shape.ip,
    name: z.string().trim().max(64),
});
export type AddPrinterFormValues = z.infer<typeof addPrinterFormSchema>;

export const optionalUrl = z.union([z.literal(''), z.url()]);

export const printerSettingsFormSchema = z.object({
    name: z.string().trim().min(1).max(64),
    ip: ipv4,
    httpPort: z.number().int().min(1024).max(65535),
    settings: printerSettingsSchema.required().extend({
        pollIntervalSec: z.number().int().min(1).max(60),
        powerOnUrl: optionalUrl,
        powerOffUrl: optionalUrl,
        powerStatusUrl: optionalUrl,
    }),
});
export type PrinterSettingsFormValues = z.infer<typeof printerSettingsFormSchema>;

export const amsSlotFormSchema = z.object({
    type: z.string().trim().min(1).max(16),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type AmsSlotFormValues = z.infer<typeof amsSlotFormSchema>;

export const aceDryFormSchema = z.object({
    targetTemp: z.number().int().min(30).max(80),
    duration: z.number().int().min(10).max(1440),
});
export type AceDryFormValues = z.infer<typeof aceDryFormSchema>;
