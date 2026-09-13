import { describe, expect, it } from 'bun:test';
import type { KobraColorBox } from '@kobralink/kobra-protocol';
import { aggregateSlots, buildAutoAmsBoxMapping, detectFilamentMode, slotUsableForPrint } from '../src/bridge/ams';

const slot = (index: number, status: number, type = 'PLA', color = [255, 0, 0]) => ({
    index,
    status,
    type,
    color,
});

const toolheadOnly: KobraColorBox[] = [
    {
        id: -1,
        loaded_slot: 1,
        slots: [slot(0, 5), slot(1, 5, 'PETG', [0, 255, 0]), slot(2, 0), slot(3, 5)],
    },
];
const aceDirect: KobraColorBox[] = [
    { id: 0, loaded_slot: 2, slots: [slot(0, 5), slot(1, 0), slot(2, 5), slot(3, 5)] },
    { id: 1, loaded_slot: -1, slots: [slot(0, 5), slot(1, 5), slot(2, 0), slot(3, 0)] },
];

describe('filament topology', () => {
    it('detects modes', () => {
        expect(detectFilamentMode(toolheadOnly)).toBe('toolhead');
        expect(detectFilamentMode(aceDirect)).toBe('ace_direct');
        expect(detectFilamentMode([...toolheadOnly, ...aceDirect])).toBe('ace_hub');
    });

    it('aggregates toolhead slots position-faithfully', () => {
        const { slots, loaded } = aggregateSlots(toolheadOnly, 'toolhead');
        expect(slots.map((s) => s.globalIndex)).toEqual([0, 1, 2, 3]);
        expect(loaded).toBe(1);
        expect(slots[1].type).toBe('PETG');
    });

    it('aggregates chained ACE units at box_id * 4', () => {
        const { slots, loaded } = aggregateSlots(aceDirect, 'ace_direct');
        expect(slots).toHaveLength(8);
        expect(slots[5].globalIndex).toBe(5);
        expect(slots[5].boxId).toBe(1);
        expect(loaded).toBe(2);
    });

    it('ace_hub offsets ACE slots after the 3 toolhead channels', () => {
        const boxes = [...toolheadOnly, aceDirect[0]];
        const { slots } = aggregateSlots(boxes, 'ace_hub');
        expect(slots.map((s) => s.globalIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(slots[3].boxId).toBe(0);
    });
});

describe('print mapping', () => {
    it('fills gaps with a loaded tray instead of the empty index', () => {
        const { slots } = aggregateSlots(toolheadOnly, 'toolhead');
        const loaded = slots.filter((s) => slotUsableForPrint(s, 'toolhead'));
        const mapping = buildAutoAmsBoxMapping(loaded, 'toolhead');
        expect(mapping.map((m) => m.paint_index)).toEqual([0, 1, 2, 3]);

        expect(mapping[2].ams_index).toBe(3);
        expect(mapping[1].material_type).toBe('PETG');
        expect(mapping[1].ams_color).toEqual([0, 255, 0, 255]);
    });

    it('ace_hub maps ACE channels from index 4', () => {
        const boxes = [...toolheadOnly, aceDirect[0]];
        const { slots } = aggregateSlots(boxes, 'ace_hub');
        const ace = slots.find((s) => s.boxId === 0 && s.index === 2) as (typeof slots)[number];
        const mapping = buildAutoAmsBoxMapping([ace], 'ace_hub');
        expect(mapping.at(-1)?.ams_index).toBe(4 + 2);
    });

    it('returns an empty mapping without loaded slots', () => {
        expect(buildAutoAmsBoxMapping([], 'toolhead')).toEqual([]);
    });
});
