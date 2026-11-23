import { z } from 'zod';

export const MAINTENANCE_PRESET_KEYS = [
    'lubricate_axes',
    'clean_nozzle',
    'check_belts',
    'clean_bed',
    'clean_fans',
] as const;
export type MaintenancePresetKey = (typeof MAINTENANCE_PRESET_KEYS)[number];

export const maintenanceTaskSchema = z.object({
    name: z.string().trim().min(1).max(64),
    presetKey: z.union([z.literal(''), z.enum(MAINTENANCE_PRESET_KEYS)]).default(''),
    note: z.string().trim().max(500).default(''),
    intervalHours: z.number().min(0).max(100000).default(0),
    intervalJobs: z.number().int().min(0).max(100000).default(0),
    intervalDays: z.number().int().min(0).max(3650).default(0),
});
export type MaintenanceTaskInput = z.input<typeof maintenanceTaskSchema>;

export const completeMaintenanceSchema = z.object({
    note: z.string().trim().max(500).default(''),
});
export type CompleteMaintenanceInput = z.input<typeof completeMaintenanceSchema>;

export interface MaintenanceUsage {
    hours: number;
    jobs: number;
    days: number;
}

export interface MaintenanceTaskDto {
    id: string;
    printerId: string;
    name: string;
    presetKey: MaintenancePresetKey | '';
    note: string;
    intervalHours: number;
    intervalJobs: number;
    intervalDays: number;
    lastDoneAt: string | null;
    usage: MaintenanceUsage;
    progress: number;
    due: boolean;
    createdAt: string;
}

export interface MaintenanceLogDto {
    id: string;
    taskId: string;
    doneAt: string;
    note: string;
    hours: number;
    jobs: number;
}

export interface MaintenancePreset {
    key: MaintenancePresetKey;
    intervalHours: number;
    intervalJobs: number;
    intervalDays: number;
}

export const MAINTENANCE_PRESETS: MaintenancePreset[] = [
    { key: 'lubricate_axes', intervalHours: 100, intervalJobs: 0, intervalDays: 0 },
    { key: 'clean_nozzle', intervalHours: 50, intervalJobs: 0, intervalDays: 0 },
    { key: 'check_belts', intervalHours: 200, intervalJobs: 0, intervalDays: 0 },
    { key: 'clean_bed', intervalHours: 0, intervalJobs: 20, intervalDays: 0 },
    { key: 'clean_fans', intervalHours: 0, intervalJobs: 0, intervalDays: 90 },
];

export function maintenanceProgress(
    task: Pick<MaintenanceTaskDto, 'intervalHours' | 'intervalJobs' | 'intervalDays'>,
    usage: MaintenanceUsage,
): { progress: number; due: boolean } {
    const ratios: number[] = [];
    if (task.intervalHours > 0) ratios.push(usage.hours / task.intervalHours);
    if (task.intervalJobs > 0) ratios.push(usage.jobs / task.intervalJobs);
    if (task.intervalDays > 0) ratios.push(usage.days / task.intervalDays);
    if (!ratios.length) return { progress: 0, due: false };
    const progress = Math.max(...ratios);
    return { progress: Math.round(progress * 1000) / 1000, due: progress >= 1 };
}
