import { describe, expect, it } from 'bun:test';
import { automationActionSchema, automationRuleSchema, automationTargets } from '../src/automations';

const rule = { name: 'Lights off', trigger: 'print_finished', actions: [{ type: 'light', on: false }] };

describe('automationRuleSchema', () => {
    it('fills the defaults: enabled, any printer, no time', () => {
        expect(automationRuleSchema.parse(rule)).toEqual({
            name: 'Lights off',
            enabled: true,
            trigger: 'print_finished',
            time: '',
            printerId: null,
            targetTags: [],
            actions: [{ type: 'light', on: false }],
        });
    });

    it('requires a valid time for the time trigger', () => {
        expect(automationRuleSchema.safeParse({ ...rule, trigger: 'time' }).success).toBe(false);
        expect(automationRuleSchema.safeParse({ ...rule, trigger: 'time', time: '25:00' }).success).toBe(false);
        expect(automationRuleSchema.parse({ ...rule, trigger: 'time', time: '07:30' }).time).toBe('07:30');
    });

    it('needs a name, at least one action and at most ten', () => {
        expect(automationRuleSchema.safeParse({ ...rule, name: ' ' }).success).toBe(false);
        expect(automationRuleSchema.safeParse({ ...rule, actions: [] }).success).toBe(false);
        const many = Array.from({ length: 11 }, () => ({ type: 'light', on: true }));
        expect(automationRuleSchema.safeParse({ ...rule, actions: many }).success).toBe(false);
    });

    it('normalises the target tags', () => {
        expect(automationRuleSchema.parse({ ...rule, targetTags: ['Farm'] }).targetTags).toEqual(['farm']);
        expect(automationRuleSchema.safeParse({ ...rule, trigger: 'sunrise' }).success).toBe(false);
    });
});

describe('automationActionSchema', () => {
    it('accepts every action and bounds their values', () => {
        for (const a of [
            { type: 'macro', macroId: 'm1' },
            { type: 'light', on: true },
            { type: 'feed', slotIndex: 0, direction: 'out' },
            { type: 'power', action: 'off' },
            { type: 'notify', message: 'Bed is free' },
            { type: 'wait', seconds: 600 },
        ]) {
            expect(automationActionSchema.safeParse(a).success).toBe(true);
        }
        expect(automationActionSchema.safeParse({ type: 'wait', seconds: 0 }).success).toBe(false);
        expect(automationActionSchema.safeParse({ type: 'notify', message: '' }).success).toBe(false);
        expect(automationActionSchema.safeParse({ type: 'gcode', line: 'G28' }).success).toBe(false);
    });
});

describe('automationTargets', () => {
    it('matches one printer, every printer carrying the tags, or every printer', () => {
        const p = { id: 'p1', tags: ['farm', 'pla'] };
        expect(automationTargets({ printerId: 'p1', targetTags: [] }, p)).toBe(true);
        expect(automationTargets({ printerId: 'p2', targetTags: [] }, p)).toBe(false);
        expect(automationTargets({ printerId: null, targetTags: ['farm'] }, p)).toBe(true);
        expect(automationTargets({ printerId: null, targetTags: ['farm', 'abs'] }, p)).toBe(false);
        expect(automationTargets({ printerId: null, targetTags: [] }, p)).toBe(true);
    });
});
