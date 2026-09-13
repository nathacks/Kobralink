import { describe, expect, it } from 'bun:test';
import type { KobraColorBox } from '@kobralink/kobra-protocol';
import {
    aggregateAceUnits,
    aggregateSlots,
    buildAutoAmsBoxMapping,
    detectFilamentMode,
    globalToBoxSlot,
    slotUsableForPrint,
} from '../src/bridge/ams';

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

describe('ams commands', () => {
    it('maps global index back to box + local slot from known slots', () => {
        const { slots } = aggregateSlots(aceDirect, 'ace_direct');
        expect(globalToBoxSlot(slots, 6, 'ace_direct')).toEqual({ boxId: 1, localSlot: 2 });
    });

    it('falls back to arithmetic mapping when the slot is unknown', () => {
        expect(globalToBoxSlot([], 6, 'toolhead')).toEqual({ boxId: -1, localSlot: 6 });
        const { slots } = aggregateSlots(aceDirect, 'ace_direct');
        expect(globalToBoxSlot(slots, 9, 'ace_direct')).toEqual({ boxId: 2, localSlot: 1 });
    });

    it('aggregates ACE drying and auto-feed, keeping previous values when absent', () => {
        const boxes: KobraColorBox[] = [
            {
                id: 0,
                auto_feed: 1,
                drying_status: { status: 1, target_temp: 50, duration: 7200, remain_time: 3600, humidity: 22 },
            },
            { id: 1 },
        ];
        const first = aggregateAceUnits(boxes, []);
        expect(first.units.map((u) => u.id)).toEqual([0, 1]);
        expect(first.units[0].autoFeed).toBe(true);
        expect(first.drying).toMatchObject({ status: 1, targetTemp: 50, duration: 120, remainTime: 60, humidity: 22 });
        const second = aggregateAceUnits([{ id: 0 }, { id: 1 }], first.units);
        expect(second.units[0].autoFeed).toBe(true);
        expect(second.units[0].drying.targetTemp).toBe(50);
    });
});
