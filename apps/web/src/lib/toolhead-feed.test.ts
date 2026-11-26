import type { AmsSlot } from '@kobralink/shared';
import { describe, expect, it } from 'vitest';
import { toolheadFeed } from './toolhead-feed';

function slot(globalIndex: number, boxId: number, index: number, color: AmsSlot['color'], status = 5): AmsSlot {
    return { globalIndex, boxId, index, status, type: 'PLA', color, activity: '' };
}

describe('toolheadFeed', () => {
    it('fills the four Kobra X inlets from the head slots and shows the loaded channel', () => {
        const slots = [
            slot(0, -1, 0, [255, 0, 0]),
            slot(1, -1, 1, [0, 255, 0]),
            slot(2, -1, 2, [0, 0, 0], 4),
            slot(3, -1, 3, [0, 0, 255]),
        ];
        expect(toolheadFeed(slots, 1, 'toolhead', 40)).toEqual({
            fanSpeed: 40,
            channel: 2,
            loaded: '#00ff00',
            inlets: ['#ff0000', '#00ff00', null, '#0000ff'],
        });
    });

    it('feeds the last inlet with the ACE spool loaded through the hub', () => {
        const slots = [slot(0, -1, 0, [255, 0, 0]), slot(4, 0, 1, [10, 20, 30])];
        const feed = toolheadFeed(slots, 4, 'ace_hub', 0);
        expect(feed.channel).toBe(4);
        expect(feed.loaded).toBe('#0a141e');
        expect(feed.inlets).toEqual(['#ff0000', null, null, '#0a141e']);
    });

    it('shows no channel and no loaded filament when nothing is loaded', () => {
        const feed = toolheadFeed([slot(0, 0, 0, [1, 2, 3])], -1, 'ace_direct', 0);
        expect(feed).toMatchObject({ channel: null, loaded: null, inlets: [null, null, null, null] });
    });
});
