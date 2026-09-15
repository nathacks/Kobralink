export interface ParsedLayer {
    z: number;
    segs: Float32Array;
}

export interface ParsedGcode {
    layers: ParsedLayer[];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export type WorkerRequest = { text: string };
export type WorkerResponse = { ok: true; data: ParsedGcode } | { ok: false; error: string } | { progress: number };

function parse(text: string, report: (p: number) => void): ParsedGcode {
    const layers: { z: number; segs: number[] }[] = [];
    let cur: { z: number; segs: number[] } | null = null;
    let x = 0;
    let y = 0;
    let z = 0;
    let e = 0;
    let absPos = true;
    let absE = true;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    const len = text.length;
    let pos = 0;
    let lineNo = 0;
    const ensureLayer = (zz: number) => {
        if (!cur || cur.z !== zz) {
            const existing = layers.find((l) => l.z === zz);
            if (existing) cur = existing;
            else {
                cur = { z: zz, segs: [] };
                layers.push(cur);
            }
        }
        return cur;
    };
    while (pos < len) {
        let end = text.indexOf('\n', pos);
        if (end < 0) end = len;
        let line = text.slice(pos, end);
        pos = end + 1;
        lineNo += 1;
        if ((lineNo & 0xffff) === 0) report(pos / len);
        const sc = line.indexOf(';');
        if (sc >= 0) line = line.slice(0, sc);
        line = line.trim();
        if (!line) continue;
        const c0 = line.charCodeAt(0);
        if (c0 === 71 || c0 === 103) {
            const sp = line.indexOf(' ');
            const code = sp < 0 ? line.slice(1) : line.slice(1, sp);
            if (code === '0' || code === '1') {
                let nx = x;
                let ny = y;
                let nz = z;
                let ne = e;
                let hasE = false;
                const parts = line.split(/\s+/);
                for (let i = 1; i < parts.length; i++) {
                    const p = parts[i];
                    const v = Number.parseFloat(p.slice(1));
                    if (Number.isNaN(v)) continue;
                    switch (p.charCodeAt(0)) {
                        case 88:
                        case 120:
                            nx = absPos ? v : x + v;
                            break;
                        case 89:
                        case 121:
                            ny = absPos ? v : y + v;
                            break;
                        case 90:
                        case 122:
                            nz = absPos ? v : z + v;
                            break;
                        case 69:
                        case 101:
                            ne = absE ? v : e + v;
                            hasE = true;
                            break;
                    }
                }
                const extruding = hasE && ne > e + 1e-6 && (nx !== x || ny !== y);
                if (extruding) {
                    const layer = ensureLayer(nz);
                    layer.segs.push(x, y, nx, ny, ne - e);
                    if (nx < minX) minX = nx;
                    if (nx > maxX) maxX = nx;
                    if (ny < minY) minY = ny;
                    if (ny > maxY) maxY = ny;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
                x = nx;
                y = ny;
                z = nz;
                e = ne;
            } else if (code === '90') absPos = true;
            else if (code === '91') absPos = false;
            else if (code === '92') {
                const mE = /E(-?[\d.]+)/i.exec(line);
                if (mE) e = Number.parseFloat(mE[1]);
                const mX = /X(-?[\d.]+)/i.exec(line);
                if (mX) x = Number.parseFloat(mX[1]);
                const mY = /Y(-?[\d.]+)/i.exec(line);
                if (mY) y = Number.parseFloat(mY[1]);
                const mZ = /Z(-?[\d.]+)/i.exec(line);
                if (mZ) z = Number.parseFloat(mZ[1]);
            }
        } else if (c0 === 77 || c0 === 109) {
            if (line.startsWith('M82') || line.startsWith('m82')) absE = true;
            else if (line.startsWith('M83') || line.startsWith('m83')) absE = false;
        }
    }
    const out = layers
        .filter((l) => l.segs.length >= 5)
        .sort((a, b) => a.z - b.z)
        .map((l) => ({ z: l.z, segs: Float32Array.from(l.segs) }));
    if (!Number.isFinite(minX)) {
        minX = 0;
        maxX = 1;
        minY = 0;
        maxY = 1;
    }
    return { layers: out, minX, maxX, minY, maxY };
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
    try {
        const data = parse(ev.data.text, (progress) => self.postMessage({ progress } satisfies WorkerResponse));
        const buffers = data.layers.map((l) => l.segs.buffer);
        (self as unknown as { postMessage: (m: WorkerResponse, t: Transferable[]) => void }).postMessage(
            { ok: true, data },
            buffers,
        );
    } catch (e) {
        self.postMessage({ ok: false, error: (e as Error).message } satisfies WorkerResponse);
    }
};
