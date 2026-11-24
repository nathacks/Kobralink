import { describe, expect, it } from 'vitest';
import { balance, type Heights, type Side } from './balanced-columns';

const same = (height: number): Heights => ({ left: height, right: height });
const cards = [same(180), same(530)];
const right: Side[] = ['right', 'right'];

describe('balance', () => {
    it('keeps every card on the right when the left column is much taller', () => {
        expect(balance({ left: 2100, right: 1400 }, cards, ['left', 'left'])).toEqual(['right', 'right']);
    });

    it('moves every card to the left when the right column is much taller', () => {
        expect(balance({ left: 1000, right: 1700 }, cards, right)).toEqual(['left', 'left']);
    });

    it('splits the cards when the gap fits a single one', () => {
        expect(balance({ left: 1700, right: 1350 }, cards, right)).toEqual(['left', 'right']);
    });

    it('uses the height of the card on the side it would land on', () => {
        expect(balance({ left: 1000, right: 1200 }, [{ left: 200, right: 600 }], ['right'])).toEqual(['left']);
    });

    it('never moves a pinned card', () => {
        expect(balance({ left: 1000, right: 1700 }, cards, right, ['right'])).toEqual(['right', 'left']);
    });

    it('does not move anything for a negligible gain', () => {
        const current: Side[] = ['right'];
        expect(balance({ left: 1000, right: 1010 }, [same(100)], current)).toBe(current);
    });
});
