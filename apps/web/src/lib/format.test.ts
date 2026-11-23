import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';
import { m } from './i18n';

describe('formatDuration', () => {
    const h = (n: number | string) => m.duration_hours({ n });
    const min = (n: number | string) => m.duration_minutes({ n });
    const s = (n: number | string) => m.duration_seconds({ n });

    it('shows the three largest units by default', () => {
        expect(formatDuration(65_300)).toBe(`${h(18)} ${min('08')} ${s(20)}`);
        expect(formatDuration(90)).toBe(`${min(1)} ${s(30)}`);
    });

    it('can show fewer units', () => {
        expect(formatDuration(65_300, { units: 2 })).toBe(`${h(18)} ${min('08')}`);
    });

    it('shows a dash for nothing unless zero is asked for', () => {
        expect(formatDuration(0)).toBe('—');
        expect(formatDuration(-1)).toBe('—');
        expect(formatDuration(0, { zero: true })).toBe(s(0));
    });
});
