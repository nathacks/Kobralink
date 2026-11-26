import { describe, expect, it } from 'bun:test';
import type { KobraColorBox } from '@kobralink/kobra-protocol';
import { printSlotsFromMapping, slotActivityMap } from '../src/bridge/ams';

const box = (currentStatus: number, slotIndex = 1, id = 0): KobraColorBox => ({
    id,
    slots: [],
    feed_status: { current_status: currentStatus, slot_index: slotIndex, type: 1 },
});

describe('slotActivityMap', () => {
    it('reads heating, unloading and loading the way the official client does', () => {
        expect(slotActivityMap([box(1)], -1, 'ace_direct').get(1)).toBe('heating');
        expect(slotActivityMap([box(2)], -1, 'ace_direct').get(1)).toBe('retracting');
        expect(slotActivityMap([box(3)], -1, 'ace_direct').get(1)).toBe('feeding');
    });

    it('treats 10 and 11 as a finished load and unload, not as work in progress', () => {
        expect(slotActivityMap([box(10)], -1, 'ace_direct').has(1)).toBe(false);
        expect(slotActivityMap([box(11)], -1, 'ace_direct').has(1)).toBe(false);
        expect(slotActivityMap([box(10)], 1, 'ace_direct').get(1)).toBe('loaded');
    });

    it('ignores an idle feed status', () => {
        expect(slotActivityMap([box(-1)], -1, 'ace_direct').size).toBe(0);
        expect(slotActivityMap([box(0)], -1, 'ace_direct').size).toBe(0);
    });

    it('places the activity on the global slot of each filament mode', () => {
        expect(slotActivityMap([box(3, 2, 1)], -1, 'ace_direct').get(6)).toBe('feeding');
        expect(slotActivityMap([box(3, 2, 1)], -1, 'ace_hub').get(9)).toBe('feeding');
        expect(slotActivityMap([box(3, 2, -1)], -1, 'ace_hub').get(2)).toBe('feeding');
        expect(slotActivityMap([box(3, 0, -1)], -1, 'toolhead').get(0)).toBe('feeding');
    });

    it('keeps the activity of the loaded slot over the loaded label', () => {
        const map = slotActivityMap([box(2, 1)], 1, 'ace_direct');
        expect(map.get(1)).toBe('retracting');
    });
});

describe('printSlotsFromMapping', () => {
    const entry = (paint: number, ams: number) => ({
        paint_index: paint,
        ams_index: ams,
        paint_color: [0, 0, 0, 255] as [number, number, number, number],
        ams_color: [0, 0, 0, 255] as [number, number, number, number],
        material_type: 'PLA',
    });

    it('turns the hub print indexes back into slot indexes and leaves unmapped tools at -1', () => {
        expect(printSlotsFromMapping([entry(0, 1), entry(2, 5)], 'ace_hub')).toEqual([1, -1, 4]);
    });

    it('keeps the indexes as they are outside the hub mode', () => {
        expect(printSlotsFromMapping([entry(0, 5), entry(1, 2)], 'ace_direct')).toEqual([5, 2]);
    });
});
