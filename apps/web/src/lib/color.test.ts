import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHex, textOn } from './color';

describe('color', () => {
    it('converts between hex and rgb', () => {
        expect(hexToRgb('#26a69a')).toEqual([38, 166, 154]);
        expect(rgbToHex([38, 166, 154])).toBe('#26a69a');
    });

    it('clamps out of range channels', () => {
        expect(rgbToHex([300, -5, 16])).toBe('#ff0010');
    });

    it('picks a readable text color', () => {
        expect(textOn([255, 255, 255])).toBe('#111');
        expect(textOn([0, 0, 0])).toBe('#fff');
    });
});
