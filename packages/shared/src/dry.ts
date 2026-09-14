import { z } from 'zod';

export interface ScheduledDryDto {
    id: string;
    printerId: string;
    aceId: number | null;
    startAt: string;
    targetTemp: number;
    duration: number;
    createdAt: string;
}

export const scheduleDrySchema = z.object({
    aceId: z.number().int().min(0).max(3).nullable().default(null),
    startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { params: { i18n: 'date' } }),
    targetTemp: z.number().int().min(30).max(80),
    duration: z.number().int().min(10).max(1440),
});
export type ScheduleDryInput = z.input<typeof scheduleDrySchema>;
