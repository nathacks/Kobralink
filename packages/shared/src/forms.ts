import { z } from 'zod';
import { addPrinterSchema, ipv4, printerSettingsSchema } from './printer';

export const loginFormSchema = z.object({
    name: z.string().trim().max(64, '64 caractères maximum'),
    email: z.email('Adresse e-mail invalide'),
    password: z.string().min(8, 'Au moins 8 caractères'),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const addPrinterFormSchema = z.object({
    ip: addPrinterSchema.shape.ip,
    name: z.string().trim().max(64, '64 caractères maximum'),
});
export type AddPrinterFormValues = z.infer<typeof addPrinterFormSchema>;

export const printerSettingsFormSchema = z.object({
    name: z.string().trim().min(1, 'Nom requis').max(64, '64 caractères maximum'),
    ip: ipv4,
    httpPort: z.number({ error: 'Port invalide' }).int().min(1024, 'Minimum 1024').max(65535, 'Maximum 65535'),
    settings: printerSettingsSchema.required().extend({
        pollIntervalSec: z.number({ error: 'Valeur invalide' }).int().min(1, 'Minimum 1 s').max(60, 'Maximum 60 s'),
    }),
});
export type PrinterSettingsFormValues = z.infer<typeof printerSettingsFormSchema>;

export const amsSlotFormSchema = z.object({
    type: z.string().trim().min(1, 'Matière requise').max(16, '16 caractères maximum'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide'),
});
export type AmsSlotFormValues = z.infer<typeof amsSlotFormSchema>;

export const aceDryFormSchema = z.object({
    targetTemp: z.number({ error: 'Valeur invalide' }).int().min(30, 'Minimum 30 °C').max(80, 'Maximum 80 °C'),
    duration: z.number({ error: 'Valeur invalide' }).int().min(10, 'Minimum 10 min').max(1440, 'Maximum 24 h'),
});
export type AceDryFormValues = z.infer<typeof aceDryFormSchema>;
