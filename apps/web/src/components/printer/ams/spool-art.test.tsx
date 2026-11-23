import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { remainingFraction } from '@/hooks/use-slot-spool';
import { isDark } from '@/lib/color';
import { SpoolArt, SpoolProgress, slotFraction, spoolRadius } from './spool-art';

const filamentRadius = (container: HTMLElement) =>
    Number(container.querySelector('[data-filament]')?.getAttribute('r'));

describe('remainingFraction', () => {
    it('divides what is left by the total', () => {
        expect(remainingFraction(250, 1000)).toBe(0.25);
    });

    it('is unknown without a total', () => {
        expect(remainingFraction(250, 0)).toBeUndefined();
        expect(remainingFraction(undefined, 1000)).toBeUndefined();
    });
});

describe('isDark', () => {
    it('reads hex and rgb colours', () => {
        expect(isDark('#111111')).toBe(true);
        expect(isDark('rgb(20, 20, 22)')).toBe(true);
        expect(isDark('#e6e6e6')).toBe(false);
    });
});

describe('spoolRadius', () => {
    it('goes from the hub to a full spool', () => {
        expect(spoolRadius(0)).toBe(17);
        expect(spoolRadius(1)).toBe(44);
    });

    it('follows the wound volume, so half a spool is past half the radius', () => {
        expect(spoolRadius(0.5)).toBeGreaterThan((17 + 44) / 2);
    });
});

describe('SpoolArt', () => {
    it('draws a thinner ring of filament as the spool runs out', () => {
        const full = render(<SpoolArt color="#ff7a00" fraction={1} />).container;
        const low = render(<SpoolArt color="#ff7a00" fraction={0.2} />).container;
        expect(filamentRadius(low)).toBeLessThan(filamentRadius(full));
        expect(full.querySelector('[data-filament]')?.getAttribute('fill')).toBe('#ff7a00');
    });

    it('draws a bare spool when nothing is loaded', () => {
        const { container } = render(<SpoolArt fraction={1} />);
        expect(container.querySelector('[data-filament]')).toBeNull();
    });
});

describe('SpoolProgress', () => {
    it('shows what is left as a progress bar', () => {
        render(<SpoolProgress fraction={0.74} color="#111111" />);
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('74');
        expect(screen.getByText('74%')).toBeTruthy();
    });

    it('is hidden when the amount left is unknown', () => {
        render(<SpoolProgress color="#111111" />);
        expect(screen.queryByRole('progressbar')).toBeNull();
    });
});

describe('slotFraction', () => {
    it('prefers the spool mapped in Spoolman or Kobralink', () => {
        expect(slotFraction(0.4, 90)).toBe(0.4);
    });

    it('falls back to the percentage the ACE reports', () => {
        expect(slotFraction(undefined, 20)).toBe(0.2);
        expect(slotFraction(undefined, 0)).toBe(0);
    });

    it('stays unknown without either', () => {
        expect(slotFraction(undefined, undefined)).toBeUndefined();
    });
});
