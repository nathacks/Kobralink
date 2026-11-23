import { describe, expect, it } from 'vitest';
import { fitCamera } from './scene-fit';

const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

describe('fitCamera', () => {
    it('keeps the whole part inside the view', () => {
        const size = { x: 250, y: 20, z: 15 };
        const fit = fitCamera(size, 45);
        const radius = 0.5 * Math.hypot(size.x, size.y, size.z);
        const halfAngle = Math.asin(radius / fit.distance);
        expect(halfAngle).toBeLessThan((45 * Math.PI) / 360);
    });

    it('frames a long flat part closer than the old fixed padding did', () => {
        const fit = fitCamera({ x: 250, y: 20, z: 15 }, 45);
        const old = 250 * 1.9 + 20;
        expect(fit.distance).toBeLessThan(old);
    });

    it('aims at the middle of the part height', () => {
        const fit = fitCamera({ x: 40, y: 40, z: 80 }, 45);
        expect(fit.target).toEqual([0, 40, 0]);
        expect(dist(fit.position, fit.target)).toBeCloseTo(fit.distance, 5);
    });

    it('moves back on narrow viewports', () => {
        const wide = fitCamera({ x: 100, y: 100, z: 20 }, 45, 2);
        const narrow = fitCamera({ x: 100, y: 100, z: 20 }, 45, 0.5);
        expect(narrow.distance).toBeGreaterThan(wide.distance);
    });
});
