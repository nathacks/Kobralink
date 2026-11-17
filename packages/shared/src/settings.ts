import { z } from 'zod';
import { homeAssistantApiSettingsSchema } from './home-assistant';
import { patchSchema } from './patch';

export const notificationEventsSchema = z.object({
    printStarted: z.boolean().default(false),
    printFinished: z.boolean().default(true),
    printCancelled: z.boolean().default(true),
    printPaused: z.boolean().default(true),
    printerOffline: z.boolean().default(false),
    printerOnline: z.boolean().default(false),
    dryingDone: z.boolean().default(true),
    alerts: z.boolean().default(true),
    queueNext: z.boolean().default(true),
    printFailure: z.boolean().default(true),
    scheduledPrint: z.boolean().default(true),
    maintenanceDue: z.boolean().default(true),
    automation: z.boolean().default(true),
});
export type NotificationEvents = z.infer<typeof notificationEventsSchema>;

export const notificationSettingsSchema = z.object({
    browser: z.boolean().default(true),
    webhookUrl: z.string().trim().default(''),
    discordUrl: z.string().trim().default(''),
    telegramToken: z.string().trim().default(''),
    telegramChatId: z.string().trim().default(''),
    ntfyUrl: z.string().trim().default(''),
    events: notificationEventsSchema.default(notificationEventsSchema.parse({})),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const haMqttSettingsSchema = z.object({
    enabled: z.boolean().default(false),
    url: z.string().trim().default(''),
    username: z.string().trim().default(''),
    password: z.string().default(''),
    discoveryPrefix: z.string().trim().min(1).max(64).default('homeassistant'),
    topicPrefix: z.string().trim().min(1).max(64).default('farolprint'),
});
export type HaMqttSettings = z.infer<typeof haMqttSettingsSchema>;

export const failureDetectionSettingsSchema = z.object({
    enabled: z.boolean().default(false),
    action: z.enum(['notify', 'pause', 'cancel']).default('notify'),
    sensitivity: z.number().min(0.5).max(2).default(1),
    intervalSec: z.number().int().min(5).max(60).default(10),
});
export type FailureDetectionSettings = z.infer<typeof failureDetectionSettingsSchema>;
export type FailureDetectionAction = FailureDetectionSettings['action'];

export const aceDryPresetSchema = z.object({
    name: z.string().trim().min(1).max(32),
    targetTemp: z.number().int().min(30).max(80),
    duration: z.number().int().min(10).max(1440),
});
export type AceDryPreset = z.infer<typeof aceDryPresetSchema>;

export const DEFAULT_DRY_PRESETS: AceDryPreset[] = [
    { name: 'PLA', targetTemp: 45, duration: 240 },
    { name: 'PETG', targetTemp: 55, duration: 300 },
    { name: 'ABS', targetTemp: 60, duration: 300 },
    { name: 'TPU', targetTemp: 50, duration: 300 },
    { name: 'PA', targetTemp: 70, duration: 480 },
];

export const costSettingsSchema = z.object({
    energyPricePerKwh: z.number().min(0).max(100).default(0),
    printerPowerW: z.number().min(0).max(5000).default(0),
});
export type CostSettings = z.infer<typeof costSettingsSchema>;

export const APP_LOCALES = ['fr', 'en', 'de', 'es', 'it', 'zh-cn', 'pt-br'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const appSettingsSchema = z.object({
    locale: z.enum(APP_LOCALES).default('fr'),
    currency: z.string().trim().min(1).max(8).default('EUR'),
    filamentPricePerKg: z.number().min(0).max(100000).default(0),
    costs: costSettingsSchema.default(costSettingsSchema.parse({})),
    spoolmanUrl: z.string().trim().default(''),
    spoolmanSyncRateSec: z.number().int().min(0).max(3600).default(0),
    verboseHttpLog: z.boolean().default(false),
    updateCheck: z.boolean().default(true),
    moonrakerApiKey: z.boolean().default(false),
    notifications: notificationSettingsSchema.default(notificationSettingsSchema.parse({})),
    haMqtt: haMqttSettingsSchema.default(haMqttSettingsSchema.parse({})),
    homeAssistant: homeAssistantApiSettingsSchema.default(homeAssistantApiSettingsSchema.parse({})),
    aceDryPresets: z.array(aceDryPresetSchema).max(20).default(DEFAULT_DRY_PRESETS),
    failureDetection: failureDetectionSettingsSchema.default(failureDetectionSettingsSchema.parse({})),
    publicUrl: z.union([z.literal(''), z.url()]).default(''),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
export const updateAppSettingsSchema = patchSchema(appSettingsSchema);
export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;

export interface SpoolmanFilament {
    id: number;
    name?: string;
    material?: string;
    color_hex?: string;
    vendor?: { id: number; name: string };
    price?: number;
    weight?: number;
    density?: number;
    diameter?: number;
}

export interface SpoolmanSpool {
    id: number;
    price?: number;
    initial_weight?: number;
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
