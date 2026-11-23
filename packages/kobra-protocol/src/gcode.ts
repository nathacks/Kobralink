export interface GcodeFilamentInfo {
    slotIndex: number;
    colorHex: string;
    material: string;
    isUsed: boolean;
    usedMm: number | null;
    usedG: number | null;
}

export interface GcodeMetadata {
    estimatedTimeSec: number;
    layerHeight: number;
    firstLayerHeight: number;
    thumbnailB64: string;
    filaments: GcodeFilamentInfo[];
    objects: string[];
    target: GcodeTarget;
}

function headAndTail(data: Buffer, head: number, tail: number): string {
    const h = data.subarray(0, Math.min(head, data.length)).toString('utf8');
    const t = data.length > tail ? data.subarray(data.length - tail).toString('utf8') : '';
    return `${h}\n${t}`;
}

export function parseEstimatedTime(data: Buffer): number {
    const text = headAndTail(data, 16384, 65536);
    const m =
        /;[ \t]*total estimated time:[ \t]*(.*)/.exec(text) ??
        /;[ \t]*estimated printing time \(normal mode\)[ \t]*=[ \t]*(.*)/.exec(text);
    if (!m) return 0;
    let secs = 0;
    for (const part of m[1].matchAll(/(\d+)\s*([hms])/g)) {
        const v = Number(part[1]);
        if (part[2] === 'h') secs += v * 3600;
        else if (part[2] === 'm') secs += v * 60;
        else secs += v;
    }
    return secs;
}

export function parseLayerHeights(data: Buffer): { layerHeight: number; firstLayerHeight: number } {
    const text = headAndTail(data, 16384, 65536);
    const grab = (re: RegExp) => {
        const m = re.exec(text);
        if (!m) return 0;
        const v = Number.parseFloat(m[1]);
        return Number.isFinite(v) ? v : 0;
    };
    const layerHeight = grab(/;[ \t]*layer_height[ \t]*=[ \t]*([0-9.]+)/);
    const firstLayerHeight =
        grab(/;[ \t]*initial_layer_print_height[ \t]*=[ \t]*([0-9.]+)/) ||
        grab(/;[ \t]*first_layer_height[ \t]*=[ \t]*([0-9.]+)/) ||
        layerHeight;
    return { layerHeight, firstLayerHeight };
}

export function extractThumbnail(data: Buffer): string {
    const begin = Buffer.from('; thumbnail begin');
    const endMarker = Buffer.from('; thumbnail end');
    let best = '';
    let from = 0;
    while (true) {
        const start = data.indexOf(begin, from);
        if (start === -1) break;
        const lineEnd = data.indexOf(0x0a, start);
        if (lineEnd === -1) break;
        const end = data.indexOf(endMarker, lineEnd);
        if (end === -1) break;
        const block = data
            .subarray(lineEnd + 1, end)
            .toString('ascii')
            .split('\n')
            .map((l) => (l.startsWith('; ') ? l.slice(2) : l).trim())
            .join('');
        if (block.length > best.length) best = block;
        from = end + endMarker.length;
    }
    return best;
}

export function extractFilamentInfo(data: Buffer): GcodeFilamentInfo[] {
    const header = headAndTail(data, 131072, 131072);
    let colors: string[] = [];
    let materials: string[] = [];
    let paintCountHint = 0;
    let toolOrder: number[] = [];
    let usedMm: number[] = [];
    let usedG: number[] = [];
    let densities: number[] = [];
    let diameters: number[] = [];

    for (const line of header.split('\n')) {
        if (/^\s*;\s*filament_colour\s*=/.test(line)) {
            colors = splitList(line.split('=').slice(1).join('='), ';').map(stripHash);
        } else if (/^\s*;\s*filament_multi_colour\s*=/.test(line) && colors.length === 0) {
            colors = splitList(line.split('=').slice(1).join('='), ';').map(stripHash);
        } else if (/^\s*;\s*filament_type\s*=/.test(line)) {
            materials = splitList(line.split('=').slice(1).join('='), /[;,]/);
            paintCountHint = Math.max(paintCountHint, materials.length);
        } else if (/^\s*;\s*filament used \[mm\]\s*=/.test(line)) {
            usedMm = numberList(line.split('=').slice(1).join('='));
        } else if (/^\s*;\s*filament used \[g\]\s*=/.test(line)) {
            usedG = numberList(line.split('=').slice(1).join('='));
        } else if (/^\s*;\s*filament_(density|diameter)\s*[:=]/.test(line)) {
            const parts = numberList(line.replace(/^[^:=]*[:=]/, ''));
            paintCountHint = Math.max(paintCountHint, parts.length);
            if (/filament_density/.test(line)) densities = parts;
            else diameters = parts;
        } else if (/^\s*;\s*filament\s*:/.test(line)) {
            toolOrder = splitList(line.split(':').slice(1).join(':'), ',')
                .map((p) => Number.parseInt(p, 10))
                .filter((n) => Number.isFinite(n));
        }
    }

    let total = Math.max(colors.length, materials.length, paintCountHint);
    if (toolOrder.length) total = Math.max(total, ...toolOrder);
    if (total <= 0) return [];

    while (colors.length < total) colors.push('FFFFFF');
    while (materials.length < total) materials.push('PLA');

    const usedFromBody = new Set<number>();
    const body = data.toString('latin1');
    for (const m of body.matchAll(/^[ \t]*T(\d+)\b/gm)) usedFromBody.add(Number(m[1]));
    const usedFromHeader = new Set(toolOrder.map((n) => Math.max(0, n - 1)));

    const out: GcodeFilamentInfo[] = [];
    for (let i = 0; i < total; i++) {
        const hex = colors[i] || 'FFFFFF';
        out.push({
            slotIndex: i,
            colorHex: `#${hex.toUpperCase()}`,
            material: materials[i] || 'PLA',
            isUsed: usedFromBody.size ? usedFromBody.has(i) : usedFromHeader.size ? usedFromHeader.has(i) : true,
            ...usage(i, usedMm, usedG, densities, diameters),
        });
    }
    return out;
}

export function parseGcodeMetadata(data: Buffer): GcodeMetadata {
    const { layerHeight, firstLayerHeight } = parseLayerHeights(data);
    return {
        estimatedTimeSec: parseEstimatedTime(data),
        layerHeight,
        firstLayerHeight,
        thumbnailB64: extractThumbnail(data),
        filaments: extractFilamentInfo(data),
        objects: extractObjectNames(data),
        target: extractPrintTarget(data),
    };
}

export function extractObjectNames(data: Buffer): string[] {
    const text = headAndTail(data, 2 * 1024 * 1024, 256 * 1024);
    const names = new Set<string>();
    const re = /^EXCLUDE_OBJECT_DEFINE\s+NAME=(\S+)/gm;
    for (const m of text.matchAll(re)) names.add(m[1]);
    return [...names];
}

function numberList(raw: string): number[] {
    return splitList(raw, /[;,]/).map((s) => Number.parseFloat(s));
}

function usage(
    i: number,
    mm: number[],
    g: number[],
    densities: number[],
    diameters: number[],
): { usedMm: number | null; usedG: number | null } {
    const usedMm = Number.isFinite(mm[i]) ? mm[i] : null;
    if (g.length === mm.length && Number.isFinite(g[i])) return { usedMm, usedG: g[i] };
    const density = densities[i] ?? densities[0];
    const diameter = diameters[i] ?? diameters[0];
    if (usedMm === null || !(density > 0) || !(diameter > 0)) return { usedMm, usedG: null };
    const grams = (usedMm * Math.PI * (diameter / 2) ** 2 * density) / 1000;
    return { usedMm, usedG: Math.round(grams * 100) / 100 };
}

function splitList(raw: string, sep: string | RegExp): string[] {
    return raw
        .split(sep)
        .map((s) => s.trim())
        .filter(Boolean);
}

function stripHash(s: string): string {
    return s.replace(/^#/, '');
}

export interface GcodeTarget {
    printerModel: string;
    nozzleMm: number | null;
    bedX: number | null;
    bedY: number | null;
    extentX: number | null;
    extentY: number | null;
    maxZ: number | null;
}

export function extractPrintTarget(data: Buffer): GcodeTarget {
    const text = headAndTail(data, 262144, 262144);
    const value = (re: RegExp) => re.exec(text)?.[1]?.trim() ?? '';
    const firstNumber = (raw: string) => {
        const n = Number.parseFloat(raw.split(/[;,]/)[0] ?? '');
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    const area = value(/^[ \t]*;[ \t]*printable_area[ \t]*=[ \t]*(.+)$/m)
        .split(',')
        .map((p) => p.split('x').map(Number))
        .filter((p) => p.length === 2 && p.every(Number.isFinite));
    const objects = headAndTail(data, 2 * 1024 * 1024, 256 * 1024);
    let extentX = 0;
    let extentY = 0;
    for (const m of objects.matchAll(/^EXCLUDE_OBJECT_DEFINE\b.*?POLYGON=(\[.*\])/gm)) {
        for (const p of m[1].matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)) {
            extentX = Math.max(extentX, Number(p[1]));
            extentY = Math.max(extentY, Number(p[2]));
        }
    }
    return {
        printerModel: value(/^[ \t]*;[ \t]*printer_model[ \t]*=[ \t]*(.+)$/m),
        nozzleMm: firstNumber(value(/^[ \t]*;[ \t]*nozzle_diameter[ \t]*=[ \t]*(.+)$/m)),
        bedX: area.length ? Math.max(...area.map((p) => p[0])) : null,
        bedY: area.length ? Math.max(...area.map((p) => p[1])) : null,
        extentX: extentX > 0 ? Math.round(extentX * 10) / 10 : null,
        extentY: extentY > 0 ? Math.round(extentY * 10) / 10 : null,
        maxZ: firstNumber(value(/^[ \t]*;[ \t]*max_z_height[ \t]*[:=][ \t]*(.+)$/m)),
    };
}
