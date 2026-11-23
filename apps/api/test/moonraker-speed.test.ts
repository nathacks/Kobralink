import { describe, expect, it } from 'bun:test';
import { speedFactor } from '../src/moonraker/speed';

describe('speedFactor', () => {
    it('maps the three printer speed modes', () => {
        expect(speedFactor(1)).toBe(0.5);
        expect(speedFactor(2)).toBe(1.0);
        expect(speedFactor(3)).toBe(1.3);
    });

    it('reports 1.0 for a mode no source documents', () => {
        expect(speedFactor(4)).toBe(1.0);
        expect(speedFactor(0)).toBe(1.0);
    });
});
