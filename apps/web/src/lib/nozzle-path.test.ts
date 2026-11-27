import { describe, expect, it } from 'vitest';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';
import { buildToolpath, locate, onTrack, type Track, toolAt, track } from '@/lib/nozzle-path';

const square: ParsedGcode = {
    layers: [
        { z: 0.2, segs: Float32Array.from([0, 0, 10, 0, 1, 0, 10, 0, 10, 10, 1, 0, 10, 10, 0, 10, 1, 0]) },
        { z: 0.4, segs: Float32Array.from([0, 0, 10, 0, 1, 0]) },
    ],
    minX: 0,
    maxX: 10,
    minY: 0,
    maxY: 10,
};

const layer = (z: number, ...lines: number[][]) => ({
    z,
    segs: Float32Array.from(lines.flatMap(([ax, ay, bx, by]) => [ax, ay, bx, by, 1, 0])),
});
const gcode = (...layers: ParsedGcode['layers']): ParsedGcode => ({ layers, minX: 0, maxX: 10, minY: 0, maxY: 10 });

function run(data: ParsedGcode, samples: [number, number, number, number, number][]) {
    const tp = buildToolpath(data);
    let state: Track | null = null;
    for (const [x, y, z, now, hint] of samples) state = track(tp, state, { x, y, z }, now, hint);
    return state as Track;
}

describe('buildToolpath / locate', () => {
    const tp = buildToolpath(square);

    it('measures the distance along the toolpath, travels included', () => {
        expect([...tp.starts]).toEqual([0, 3, 4]);
        expect([...tp.dist]).toEqual([0, 10, 20, 40, 50]);
    });

    it('places a distance on a segment or on the travel between two', () => {
        expect(locate(tp, 15)).toEqual({ layer: 0, seg: 1, t: 0.5, x: 10, y: 5 });
        expect(locate(tp, 35)).toEqual({ layer: 0, seg: 2, t: 1, x: 0, y: 5 });
        expect(locate(buildToolpath({ ...square, layers: [] }), 0)).toBeNull();
    });
});

describe('track', () => {
    it('follows the nozzle along the layer', () => {
        const state = run(square, [
            [5, 0, 0.2, 0, 0],
            [10, 5, 0.2, 1000, 0],
        ]);
        expect(state.s).toBe(15);
        expect(onTrack(state)).toBe(true);
    });

    it('picks between two crossing lines by the time elapsed', () => {
        const crossing = gcode(layer(0.2, [0, 0, 10, 0], [10, 0, 10, 10], [10, 10, 5, -5]));
        const soon = run(crossing, [
            [2, 0, 0.2, 0, 0],
            [20 / 3, 0, 0.2, 50, 0],
        ]);
        expect(soon.s).toBeCloseTo(20 / 3);
        const later = run(crossing, [
            [2, 0, 0.2, 0, 0],
            [20 / 3, 0, 0.2, 300, 0],
        ]);
        expect(later.s).toBeCloseTo(20 + Math.hypot(5, 15) * (2 / 3));
    });

    it('only goes back after two samples agree', () => {
        const flat = gcode(square.layers[0]);
        const once = run(flat, [
            [10, 5, 0.2, 0, 0],
            [2, 0, 0.2, 1000, 0],
        ]);
        expect(once).toMatchObject({ s: 15, pending: 2 });
        expect(onTrack(once)).toBe(false);
        expect(
            run(flat, [
                [10, 5, 0.2, 0, 0],
                [2, 0, 0.2, 1000, 0],
                [4, 0, 0.2, 2000, 0],
            ]),
        ).toMatchObject({ s: 4, pending: null });
    });

    it('cannot jump further than the nozzle can travel, and confirms unlikely jumps', () => {
        const long = gcode(layer(0.2, [0, 0, 1000, 0]));
        const tooFar = run(long, [
            [0, 0, 0.2, 0, 0],
            [900, 0, 0.2, 1000, 0],
        ]);
        expect(tooFar).toMatchObject({ s: 0, misses: 1, pending: null });
        const unlikely = run(long, [
            [0, 0, 0.2, 0, 0],
            [900, 0, 0.2, 1000, 0],
            [900, 0, 0.2, 2000, 0],
        ]);
        expect(unlikely).toMatchObject({ s: 0, pending: 900 });
        expect(
            run(long, [
                [0, 0, 0.2, 0, 0],
                [900, 0, 0.2, 1000, 0],
                [900, 0, 0.2, 2000, 0],
                [950, 0, 0.2, 3000, 0],
            ]).s,
        ).toBe(950);
    });

    const stacked = gcode(layer(0.2, [0, 0, 10, 0], [10, 0, 10, 10]), layer(0.4, [20, 0, 30, 0]));
    const nextLayerStart = 20 + Math.hypot(10, 10);

    it('ignores a z-hop above the next layer', () => {
        expect(
            run(stacked, [
                [5, 0, 0.2, 0, 0],
                [25, 0, 0.6, 1000, 0],
            ]),
        ).toMatchObject({ s: 5, misses: 1, pending: null });
    });

    it('needs two samples on the next layer before leaving the current one', () => {
        const once = run(stacked, [
            [5, 0, 0.2, 0, 0],
            [25, 0, 0.4, 1000, 1],
        ]);
        expect(once).toMatchObject({ s: 5, pending: nextLayerStart + 5 });
        expect(onTrack(once)).toBe(false);
        expect(
            run(stacked, [
                [5, 0, 0.2, 0, 0],
                [25, 0, 0.4, 1000, 0],
                [10, 5, 0.2, 2000, 0],
            ]),
        ).toMatchObject({ s: 15, pending: null });
        expect(
            run(stacked, [
                [5, 0, 0.2, 0, 0],
                [25, 0, 0.4, 1000, 0],
                [27, 0, 0.4, 2000, 0],
            ]).s,
        ).toBeCloseTo(nextLayerStart + 7);
    });

    it('learns a constant z offset of the printer', () => {
        const state = run(stacked, [
            [5, 0, 0.28, 0, 0],
            [10, 5, 0.28, 1000, 0],
            [25, 0, 0.48, 2000, 0],
            [27, 0, 0.48, 3000, 0],
        ]);
        expect(state.s).toBeCloseTo(nextLayerStart + 7);
        expect(state.dz.every((d) => Math.abs(d - 0.08) < 1e-6)).toBe(true);
    });

    it('finds the nozzle again after losing it, even backwards', () => {
        const lost: [number, number, number, number, number][] = [[10, 5, 0.2, 0, 0]];
        for (let i = 1; i <= 5; i++) lost.push([100, 100, 0.2, i * 1000, 0]);
        expect(run(square, lost)).toMatchObject({ s: 15, misses: 5 });
        expect(run(square, [...lost, [2, 0, 0.2, 6000, 0]])).toMatchObject({ s: 2, misses: 0 });
    });
});

describe('toolAt', () => {
    const twoTools: ParsedGcode = {
        ...square,
        layers: [{ z: 0.2, segs: Float32Array.from([0, 0, 10, 0, 1, 0, 10, 0, 10, 10, 1, 2]) }],
    };

    it('reads the tool of the segment under the nozzle', () => {
        expect(toolAt(twoTools, { x: 5, y: 0.5, z: 0.2 })).toBe(0);
        expect(toolAt(twoTools, { x: 10, y: 6, z: 0.2 })).toBe(2);
    });

    it('returns null during a travel away from any segment', () => {
        expect(toolAt(twoTools, { x: 4, y: 6, z: 0.2 })).toBeNull();
        expect(toolAt(twoTools, { x: 5, y: 0, z: 9 })).toBeNull();
    });
});
