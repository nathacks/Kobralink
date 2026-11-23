import { z } from 'zod';
import { printerTagSchema } from './printer';

export const AUTOMATION_TRIGGERS = ['print_finished', 'print_failed', 'bed_cleared', 'filament_low', 'time'] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_ACTION_TYPES = ['macro', 'light', 'feed', 'power', 'notify', 'wait'] as const;

export const automationActionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('macro'), macroId: z.string().min(1) }),
    z.object({ type: z.literal('light'), on: z.boolean() }),
    z.object({ type: z.literal('feed'), slotIndex: z.number().int().min(0).max(19), direction: z.enum(['in', 'out']) }),
    z.object({ type: z.literal('power'), action: z.enum(['on', 'off']) }),
    z.object({ type: z.literal('notify'), message: z.string().trim().min(1).max(200) }),
    z.object({ type: z.literal('wait'), seconds: z.number().int().min(1).max(3600) }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationActionType = AutomationAction['type'];

export const AUTOMATION_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const automationRuleSchema = z
    .object({
        name: z.string().trim().min(1).max(60),
        enabled: z.boolean().default(true),
        trigger: z.enum(AUTOMATION_TRIGGERS),
        time: z.union([z.literal(''), z.string().regex(AUTOMATION_TIME_PATTERN)]).default(''),
        printerId: z.string().min(1).nullable().default(null),
        targetTags: z.array(printerTagSchema).max(10).default([]),
        actions: z.array(automationActionSchema).min(1).max(10),
    })
    .refine((r) => r.trigger !== 'time' || r.time !== '', { path: ['time'], message: 'time required' });
export type AutomationRuleInput = z.input<typeof automationRuleSchema>;
export type AutomationRule = z.output<typeof automationRuleSchema>;

export const automationEnabledSchema = z.object({ enabled: z.boolean() });

export const automationRunSchema = z.object({ printerId: z.string().min(1) });

export interface AutomationRuleDto extends AutomationRule {
    id: string;
    lastRunAt: string | null;
    lastError: string;
    createdAt: string;
}

export function automationTargets(
    rule: Pick<AutomationRule, 'printerId' | 'targetTags'>,
    printer: { id: string; tags: string[] },
): boolean {
    if (rule.printerId) return rule.printerId === printer.id;
    return rule.targetTags.every((tag) => printer.tags.includes(tag));
}
