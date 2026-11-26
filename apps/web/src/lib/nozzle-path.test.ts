import { describe, expect, it } from 'vitest';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';
import { pathBetween, pointAlong, toolAt } from '@/lib/nozzle-path';

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

describe('pathBetween', () => {
    it('follows the gcode corners between two samples of the same layer', () => {
        expect(pathBetween(square, [5, 0], [5, 10], 0.2, 0.2)).toEqual([
            [5, 0],
            [10, 0],
            [10, 0],
            [10, 10],
            [10, 10],
            [5, 10],
        ]);
    });

    it('goes straight across a layer change or when moving backwards', () => {
        expect(pathBetween(square, [5, 10], [5, 0], 0.2, 0.2)).toEqual([
            [5, 10],
            [5, 0],
        ]);
        expect(pathBetween(square, [5, 10], [2, 0], 0.2, 0.4)).toEqual([
            [5, 10],
            [2, 0],
        ]);
    });
});

describe('pointAlong', () => {
    it('walks the path by distance', () => {
        const path: [number, number][] = [
            [0, 0],
            [10, 0],
            [10, 10],
        ];
        expect(pointAlong(path, 0.5)).toEqual([10, 0]);
        expect(pointAlong(path, 0.75)).toEqual([10, 5]);
        expect(pointAlong(path, 2)).toEqual([10, 10]);
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
