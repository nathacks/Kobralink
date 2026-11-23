import { describe, expect, it } from 'vitest';
import { anyShort, checkFilament, filamentStatus } from './filament-check';

describe('filamentStatus', () => {
    it('is ok with room to spare, tight within the margin and short below the need', () => {
        expect(filamentStatus(100, 200)).toBe('ok');
        expect(filamentStatus(100, 110)).toBe('ok');
        expect(filamentStatus(100, 109)).toBe('tight');
        expect(filamentStatus(100, 100)).toBe('tight');
        expect(filamentStatus(100, 99.9)).toBe('short');
    });

    it('is unknown without the need or the remaining weight', () => {
        expect(filamentStatus(null, 500)).toBe('unknown');
        expect(filamentStatus(10, null)).toBe('unknown');
    });
});

describe('checkFilament', () => {
    it('adds up the colours printed from the same spool', () => {
        const checks = checkFilament(
            [
                { slotKey: '0', colorHex: '#000000', needG: 30 },
                { slotKey: '0', colorHex: '#FFFFFF', needG: 25 },
                { slotKey: '2', colorHex: '#FF0000', needG: 10 },
            ],
            (slot) => ({ '0': 50, '2': 400 })[slot],
        );
        expect(checks).toEqual([
            { slotKey: '0', colorHex: '#000000', needG: 55, remainingG: 50, status: 'short' },
            { slotKey: '2', colorHex: '#FF0000', needG: 10, remainingG: 400, status: 'ok' },
        ]);
        expect(anyShort(checks)).toBe(true);
    });

    it('stays unknown when a colour has no usage or the slot has no spool', () => {
        const checks = checkFilament(
            [
                { slotKey: '0', colorHex: '#000000', needG: 30 },
                { slotKey: '0', colorHex: '#FFFFFF', needG: null },
                { slotKey: '1', colorHex: '#FF0000', needG: 10 },
            ],
            (slot) => (slot === '0' ? 500 : undefined),
        );
        expect(checks.map((c) => c.status)).toEqual(['unknown', 'unknown']);
        expect(anyShort(checks)).toBe(false);
    });
});
