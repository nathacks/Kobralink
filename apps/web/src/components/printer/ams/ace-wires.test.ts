import { describe, expect, it } from 'vitest';
import { type AceRoute, filamentPaths, type SpoolBox } from './ams-card';

const spool = (slot: number, left: number, top: number, color: string | null, extra: Partial<SpoolBox> = {}) => ({
    slot,
    left,
    right: left + 40,
    top,
    mid: top + 20,
    color,
    loaded: false,
    flow: 0,
    ...extra,
});

const hub = { left: 60, right: 100, mid: 10, height: 60 };
const gutter = { left: -20, right: 120 };
const unit = (head: number, spools: SpoolBox[], extra: Partial<AceRoute> = {}): AceRoute => ({
    inlet: 'hub',
    side: 'right',
    target: hub,
    head,
    spools,
    ...extra,
});

describe('filamentPaths', () => {
    it('gives every fed spool a strand into its ACE outlet, and skips empty slots', () => {
        const spools = [
            spool(0, 0, 100, 'red'),
            spool(1, 60, 100, 'blue'),
            spool(2, 0, 150, null),
            spool(3, 60, 150, 'grey'),
        ];
        const out = filamentPaths([unit(90, spools)], gutter);
        expect(out.filter((s) => s.kind === 'tube')).toHaveLength(1);
        const strands = out.filter((s) => s.kind === 'filament');
        expect(strands.map((s) => s.color)).toEqual(['red', 'blue', 'grey']);
        expect(strands[0].d.startsWith('M40 120')).toBe(true);
        expect(strands[1].d.startsWith('M60 120')).toBe(true);
        expect(new Set(strands.map((s) => s.d.split(' ').slice(-2).join(' '))).size).toBe(1);
    });

    it('routes each ACE tube on its own lane and enters the inlet at its own height', () => {
        const tubes = filamentPaths(
            [unit(90, [spool(0, 0, 100, 'red')]), unit(190, [spool(4, 0, 200, 'green')])],
            gutter,
        ).filter((s) => s.kind === 'tube');
        expect(tubes[0].d).toContain('Q120 90 120 80');
        expect(tubes[1].d).toContain('Q131 190 131 180');
        expect(tubes.map((t) => t.ports?.[1])).toEqual([
            [100, 16],
            [100, 4],
        ]);
    });

    it('takes the left lane into an inlet on the left column', () => {
        const slot3 = { left: 0, right: 40, mid: 50, height: 60 };
        const [tube] = filamentPaths(
            [unit(90, [spool(0, 0, 100, 'red')], { inlet: 'slot-2', side: 'left', target: slot3 })],
            gutter,
        );
        expect(tube.d).toContain('Q-20 90 -20 80');
        expect(tube.d.endsWith('H0')).toBe(true);
    });

    it('squeezes the entries so many ACE units still fit in the inlet', () => {
        const units = [0, 1, 2, 3, 4, 5].map((i) => unit(100 + i * 100, [spool(i, 0, 110 + i * 100, 'red')]));
        const entries = filamentPaths(units, gutter)
            .filter((s) => s.kind === 'tube')
            .map((t) => t.ports?.[1][1] ?? 0);
        expect(Math.max(...entries) - Math.min(...entries)).toBeCloseTo(hub.height - 20);
    });

    it('bends down when the inlet sits below the ACE', () => {
        const [tube] = filamentPaths([unit(90, [spool(0, 0, 100, 'red')], { target: { ...hub, mid: 300 } })], gutter);
        expect(tube.d).toContain('Q120 90 120 100V290');
    });

    it('draws the loaded filament as one path from its spool through the tube to the inlet', () => {
        const out = filamentPaths(
            [unit(90, [spool(0, 0, 100, 'red', { loaded: true }), spool(1, 60, 100, 'blue')])],
            gutter,
        );
        const active = out.filter((s) => s.kind === 'active');
        expect(active).toHaveLength(1);
        expect(active[0]).toMatchObject({ color: 'red', key: 'a0', length: 210 });
        expect(active[0].d.startsWith('M40 120')).toBe(true);
        expect(active[0].d.endsWith('H100')).toBe(true);
        expect(out.filter((s) => s.kind === 'filament').map((s) => s.color)).toEqual(['blue']);
    });

    it('prefers the spool being fed or retracted over the loaded one', () => {
        const out = filamentPaths(
            [unit(90, [spool(0, 0, 100, 'red', { flow: -1 }), spool(1, 60, 100, 'blue', { loaded: true })])],
            gutter,
        );
        expect(out.find((s) => s.kind === 'active')).toMatchObject({ color: 'red', flow: -1 });
    });

    it('draws nothing for an ACE without slots', () => {
        expect(filamentPaths([unit(0, [])], gutter)).toEqual([]);
    });
});
