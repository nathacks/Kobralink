import { describe, expect, it } from 'bun:test';
import { moveAxisSchema } from '../src/control';

describe('moveAxisSchema', () => {
    it('accepts the official axis codes, homing XYZ included', () => {
        for (const axis of [1, 2, 3, 4, 5]) {
            expect(moveAxisSchema.safeParse({ axis, moveType: 2 }).success).toBe(true);
        }
    });

    it('refuses axis codes the printer does not know', () => {
        expect(moveAxisSchema.safeParse({ axis: 0, moveType: 2 }).success).toBe(false);
        expect(moveAxisSchema.safeParse({ axis: 6, moveType: 2 }).success).toBe(false);
    });

    it('defaults the distance to zero for a homing move', () => {
        expect(moveAxisSchema.parse({ axis: 5, moveType: 2 })).toEqual({ axis: 5, moveType: 2, distance: 0 });
    });
});
