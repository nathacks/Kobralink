import type { ParsedGcode } from '@/lib/gcode-parser.worker';

export type Point = [number, number];

const STRIDE = 6;
const MAX_SEGMENTS = 400;
const ON_SEGMENT_MM = 1.5;

function layerAt(data: ParsedGcode, z: number): number {
    let best = -1;
    let gap = Number.POSITIVE_INFINITY;
    data.layers.forEach((l, i) => {
        const d = Math.abs(l.z - z);
        if (d < gap) {
            gap = d;
            best = i;
        }
    });
    return best;
}

function nearestSegment(segs: Float32Array, [x, y]: Point): number {
    let best = 0;
    let gap = Number.POSITIVE_INFINITY;
    for (let k = 0; k < segs.length; k += STRIDE) {
        const ax = segs[k];
        const ay = segs[k + 1];
        const dx = segs[k + 2] - ax;
        const dy = segs[k + 3] - ay;
        const len = dx * dx + dy * dy;
        const t = len ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
        const d = (ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2;
        if (d < gap) {
            gap = d;
            best = k / STRIDE;
        }
    }
    return best;
}

export function toolAt(data: ParsedGcode, { x, y, z }: { x: number; y: number; z: number }): number | null {
    const layer = layerAt(data, z);
    if (layer < 0 || Math.abs(data.layers[layer].z - z) > ON_SEGMENT_MM) return null;
    const segs = data.layers[layer].segs;
    if (!segs.length) return null;
    const k = nearestSegment(segs, [x, y]) * STRIDE;
    const [ax, ay, dx, dy] = [segs[k], segs[k + 1], segs[k + 2] - segs[k], segs[k + 3] - segs[k + 1]];
    const len = dx * dx + dy * dy;
    const t = len ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
    return Math.hypot(ax + t * dx - x, ay + t * dy - y) <= ON_SEGMENT_MM ? segs[k + 5] : null;
}

export function pathBetween(data: ParsedGcode, from: Point, to: Point, fromZ: number, toZ: number): Point[] {
    const layer = layerAt(data, toZ);
    if (layer < 0 || layer !== layerAt(data, fromZ)) return [from, to];
    const segs = data.layers[layer].segs;
    const a = nearestSegment(segs, from);
    const b = nearestSegment(segs, to);
    if (b <= a || b - a > MAX_SEGMENTS) return [from, to];
    const path: Point[] = [from, [segs[a * STRIDE + 2], segs[a * STRIDE + 3]]];
    for (let i = a + 1; i < b; i++)
        path.push([segs[i * STRIDE], segs[i * STRIDE + 1]], [segs[i * STRIDE + 2], segs[i * STRIDE + 3]]);
    path.push([segs[b * STRIDE], segs[b * STRIDE + 1]], to);
    return path;
}

export function pointAlong(path: Point[], k: number): Point {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    let left = Math.min(1, Math.max(0, k)) * total;
    for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1];
        const [x1, y1] = path[i];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (left <= len && len > 0) return [x0 + ((x1 - x0) * left) / len, y0 + ((y1 - y0) * left) / len];
        left -= len;
    }
    return path[path.length - 1];
}
