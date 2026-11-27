import type { ParsedGcode } from '@/lib/gcode-parser.worker';

export type Point = [number, number];
export type Progress = { layer: number; seg: number; t: number };
export type Located = Progress & { x: number; y: number };
export type Toolpath = { data: ParsedGcode; starts: Uint32Array; dist: Float64Array };
export type Track = {
    s: number | null;
    at: number;
    misses: number;
    pending: number | null;
    speeds: number[];
    dz: number[];
};

const STRIDE = 6;
const ON_SEGMENT_MM = 1.5;
const NEAR_MM = 0.2;
const Z_TOLERANCE_MM = 1;
const MAX_SPEED_MM_S = 600;
const MIN_REACH_MS = 1000;
const MAX_MISSES = 5;
const Z_DECISIVE = 0.25;
const BACK_MM = 2;
const DEFAULT_SPEED_MM_S = 100;
const MIN_SPEED_MM_S = 5;
const HISTORY = 7;
const MIN_LAYER_MM = 0.05;
const MAX_OFFSET_SHARE = 0.45;
const XY_SPREAD_MM = 0.3;
const MIN_SPREAD_MM = 20;
const AHEAD_SPREAD = 0.5;
const SURPRISE_COST = 9;

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

function project(segs: Float32Array, k: number, x: number, y: number) {
    const ax = segs[k];
    const ay = segs[k + 1];
    const dx = segs[k + 2] - ax;
    const dy = segs[k + 3] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    return { t, gap: Math.hypot(ax + t * dx - x, ay + t * dy - y), len: Math.sqrt(len2) };
}

function lastAtMost(sorted: ArrayLike<number>, v: number, count: number): number {
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (sorted[mid] <= v) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function segCount(tp: Toolpath): number {
    return tp.dist.length - 1;
}

function layerOf(tp: Toolpath, g: number): number {
    return lastAtMost(tp.starts, g, tp.data.layers.length);
}

export function buildToolpath(data: ParsedGcode): Toolpath {
    const starts = new Uint32Array(data.layers.length + 1);
    let n = 0;
    data.layers.forEach((l, i) => {
        starts[i] = n;
        n += l.segs.length / STRIDE;
    });
    starts[data.layers.length] = n;
    const dist = new Float64Array(n + 1);
    let g = 0;
    let s = 0;
    let ex = Number.NaN;
    let ey = Number.NaN;
    for (const { segs } of data.layers) {
        for (let k = 0; k < segs.length; k += STRIDE) {
            if (g > 0) s += Math.hypot(segs[k] - ex, segs[k + 1] - ey);
            dist[g++] = s;
            ex = segs[k + 2];
            ey = segs[k + 3];
            s += Math.hypot(ex - segs[k], ey - segs[k + 1]);
        }
    }
    dist[n] = s;
    return { data, starts, dist };
}

export function locate(tp: Toolpath, s: number): Located | null {
    const n = segCount(tp);
    if (!n) return null;
    const g = lastAtMost(tp.dist, s, n);
    const layer = layerOf(tp, g);
    const seg = g - tp.starts[layer];
    const segs = tp.data.layers[layer].segs;
    const k = seg * STRIDE;
    const [ax, ay, bx, by] = [segs[k], segs[k + 1], segs[k + 2], segs[k + 3]];
    const len = Math.hypot(bx - ax, by - ay);
    const local = Math.max(0, s - tp.dist[g]);
    if (local <= len || g === n - 1) {
        const t = len ? Math.min(1, local / len) : 1;
        return { layer, seg, t, x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    const nextLayer = layerOf(tp, g + 1);
    const nk = (g + 1 - tp.starts[nextLayer]) * STRIDE;
    const next = tp.data.layers[nextLayer].segs;
    const gap = tp.dist[g + 1] - tp.dist[g] - len;
    const u = gap > 0 ? Math.min(1, (local - len) / gap) : 1;
    return { layer, seg, t: 1, x: bx + (next[nk] - bx) * u, y: by + (next[nk + 1] - by) * u };
}

function match(
    tp: Toolpath,
    [x, y]: Point,
    z: number,
    layer: number,
    sMin: number,
    sMax: number,
    expected: Expected | null,
    floor = sMin,
): { s: number; cost: number } | null {
    const n = segCount(tp);
    const first = Math.max(tp.starts[layer], lastAtMost(tp.dist, sMin, n));
    const end = Math.min(tp.starts[layer + 1], lastAtMost(tp.dist, sMax, n) + 1);
    const { z: layerZ, segs } = tp.data.layers[layer];
    if (Math.abs(z - layerZ) > Z_TOLERANCE_MM) return null;
    const hits: number[] = [];
    let best = Number.POSITIVE_INFINITY;
    for (let g = first; g < end; g++) {
        const { t, gap, len } = project(segs, (g - tp.starts[layer]) * STRIDE, x, y);
        if (gap > ON_SEGMENT_MM) continue;
        const along = tp.dist[g] + t * len;
        if (along < sMin - BACK_MM || along > sMax) continue;
        hits.push(along < floor && along >= floor - BACK_MM ? floor : along, gap);
        best = Math.min(best, gap);
    }
    if (!expected) {
        for (let i = 0; i < hits.length; i += 2) if (hits[i + 1] <= best + NEAR_MM) return { s: hits[i], cost: 0 };
        return null;
    }
    let pick: { s: number; cost: number } | null = null;
    for (let i = 0; i < hits.length; i += 2) {
        const off = hits[i] - expected.s;
        const spread = MIN_SPREAD_MM + (off > 0 ? expected.ahead : expected.behind);
        const cost = (hits[i + 1] / XY_SPREAD_MM) ** 2 + (off / spread) ** 2;
        if (!pick || cost < pick.cost) pick = { s: hits[i], cost };
    }
    return pick;
}

function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
}

type Expected = { s: number; ahead: number; behind: number };

function acquire(tp: Toolpath, xy: Point, z: number, hint: number): number | null {
    const all = tp.data.layers;
    const near = [hint, hint + 1, hint - 1].filter((l) => l >= 0 && l < all.length);
    const height = (l: number) => Math.max(MIN_LAYER_MM, all[l].z - (all[l - 1]?.z ?? 0));
    const rank = (l: number) => Math.round(Math.abs(z - all[l].z) / (Z_DECISIVE * height(l)));
    for (const layer of near.sort((a, b) => rank(a) - rank(b))) {
        const found = match(tp, xy, z, layer, tp.dist[tp.starts[layer]], tp.dist[tp.starts[layer + 1]], null);
        if (found) return found.s;
    }
    return null;
}

function layerAtS(tp: Toolpath, s: number): number {
    return layerOf(tp, lastAtMost(tp.dist, s, segCount(tp)));
}

export function track(
    tp: Toolpath,
    prev: Track | null,
    { x, y, z }: { x: number; y: number; z: number },
    now: number,
    hintLayer: number,
): Track {
    const all = tp.data.layers;
    const lost: Track = { s: null, at: now, misses: 0, pending: null, speeds: [], dz: [] };
    if (!segCount(tp)) return lost;
    const hint = Math.min(all.length - 1, Math.max(0, hintLayer));
    const xy: Point = [x, y];
    const layer = prev?.s != null ? layerAtS(tp, prev.s) : -1;
    const ref = all[Math.max(0, layer >= 0 ? layer : hint)];
    const cap = MAX_OFFSET_SHARE * Math.max(MIN_LAYER_MM, ref.z - (all[all.indexOf(ref) - 1]?.z ?? 0));
    const zc = z - Math.min(cap, Math.max(-cap, median(prev?.dz ?? [])));
    const elapsed = prev ? Math.max(1, now - prev.at) / 1000 : 0;
    const speed = prev?.speeds.length ? median(prev.speeds) : DEFAULT_SPEED_MM_S;
    const expected: Expected | null =
        prev?.s != null
            ? { s: prev.s + speed * elapsed, ahead: AHEAD_SPREAD * speed * elapsed, behind: speed * elapsed }
            : null;
    if (prev?.s != null && expected && prev.misses < MAX_MISSES && Math.abs(layer - hint) < 2) {
        const from = prev.s;
        const reach = MAX_SPEED_MM_S * Math.max(elapsed, MIN_REACH_MS / 1000);
        const hit = (s: number): Track => {
            const observed = Math.min(MAX_SPEED_MM_S, Math.max(MIN_SPEED_MM_S, (s - from) / elapsed));
            const layerZ = all[layerAtS(tp, s)].z;
            return {
                s,
                at: now,
                misses: 0,
                pending: null,
                speeds: s >= from ? [...prev.speeds, observed].slice(-HISTORY) : prev.speeds,
                dz: [...prev.dz, z - layerZ].slice(-HISTORY),
            };
        };
        const miss: Track = { ...prev, misses: prev.misses + 1 };
        const below = all[layer].z;
        const next = layer + 1 < all.length ? all[layer + 1].z : null;
        const height = Math.max(MIN_LAYER_MM, next !== null ? next - below : below - (all[layer - 1]?.z ?? 0));
        if (zc > (next ?? below) + height / 2) return miss;
        const under = all[layer - 1]?.z;
        if (under !== undefined && Math.abs(zc - under) + Z_DECISIVE * height < Math.abs(zc - below)) return miss;
        const margin = Z_DECISIVE * height;
        const zSaysNext = next !== null && Math.abs(zc - next) + margin < Math.abs(zc - below);
        const zSaysSame = next === null || Math.abs(zc - below) + margin < Math.abs(zc - next);
        const here = zSaysNext ? null : match(tp, xy, zc, layer, from - reach / 2, from + reach, expected, from);
        const above = zSaysSame ? null : match(tp, xy, zc, layer + 1, from, from + reach, expected);
        const best = here && (!above || here.cost <= above.cost) ? here : above;
        if (!best) return miss;
        const surprising = best === above || best.s < from || best.cost > SURPRISE_COST;
        if (!surprising) return hit(best.s);
        const pending = prev.pending;
        if (pending !== null && best.s >= pending - BACK_MM && best.s <= pending + reach) return hit(best.s);
        return { ...prev, pending: best.s };
    }
    const found = acquire(tp, xy, zc, hint);
    if (found !== null) return { ...lost, s: found, dz: [z - all[layerAtS(tp, found)].z] };
    const keep = prev?.s != null && Math.abs(layer - hint) < 2;
    return keep ? { ...prev, misses: prev.misses + 1, pending: null } : { ...lost, misses: (prev?.misses ?? 0) + 1 };
}

export function onTrack(state: Track): boolean {
    return state.s !== null && state.misses === 0 && state.pending === null;
}

export function toolAt(data: ParsedGcode, { x, y, z }: { x: number; y: number; z: number }): number | null {
    const layer = layerAt(data, z);
    if (layer < 0 || Math.abs(data.layers[layer].z - z) > ON_SEGMENT_MM) return null;
    const segs = data.layers[layer].segs;
    let tool = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let k = 0; k < segs.length; k += STRIDE) {
        const { gap } = project(segs, k, x, y);
        if (gap < best) {
            best = gap;
            tool = segs[k + 5];
        }
    }
    return best <= ON_SEGMENT_MM ? tool : null;
}
