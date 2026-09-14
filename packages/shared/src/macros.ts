import { z } from 'zod';

export const macroActionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('temperature'),
        nozzle: z.number().min(0).max(320).optional(),
        bed: z.number().min(0).max(120).optional(),
    }),
    z.object({ type: z.literal('fan'), speed: z.number().int().min(0).max(100) }),
    z.object({ type: z.literal('light'), on: z.boolean(), brightness: z.number().int().min(0).max(100).optional() }),
    z.object({ type: z.literal('speed'), mode: z.number().int().min(1).max(4) }),
    z.object({ type: z.literal('home'), axis: z.enum(['all', 'xy', 'z']) }),
    z.object({
        type: z.literal('move'),
        axis: z.enum(['x', 'y', 'z']),
        distance: z.number().min(-300).max(300),
    }),
    z.object({ type: z.literal('motorsOff') }),
    z.object({ type: z.literal('feed'), slotIndex: z.number().int().min(0).max(19), direction: z.enum(['in', 'out']) }),
    z.object({
        type: z.literal('dry'),
        targetTemp: z.number().int().min(30).max(80),
        duration: z.number().int().min(10).max(1440),
    }),
    z.object({ type: z.literal('dryStop') }),
    z.object({ type: z.literal('wait'), seconds: z.number().min(0).max(600) }),
    z.object({
        type: z.literal('waitTemp'),
        nozzle: z.number().min(0).max(320).optional(),
        bed: z.number().min(0).max(120).optional(),
    }),
]);
export type MacroAction = z.infer<typeof macroActionSchema>;
export type MacroActionType = MacroAction['type'];

export const MACRO_ICONS = [
    'zap',
    'flame',
    'wind',
    'lightbulb',
    'home',
    'droplets',
    'snowflake',
    'timer',
    'wrench',
    'sparkles',
] as const;
export type MacroIcon = (typeof MACRO_ICONS)[number];

export const macroSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1)
        .max(32)
        .regex(/^[A-Za-z0-9_ -]+$/),
    icon: z.enum(MACRO_ICONS).default('zap'),
    actions: z.array(macroActionSchema).min(1).max(30),
});
export type MacroInput = z.input<typeof macroSchema>;

export interface MacroDto {
    id: string;
    name: string;
    icon: MacroIcon;
    actions: MacroAction[];
    position: number;
    createdAt: string;
}

export const reorderMacrosSchema = z.object({ ids: z.array(z.string().min(1)).max(200) });
