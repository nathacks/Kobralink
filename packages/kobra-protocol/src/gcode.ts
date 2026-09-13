export interface GcodeFilamentInfo {
    slotIndex: number;
    colorHex: string;
    material: string;
    isUsed: boolean;
}

export interface GcodeMetadata {
    estimatedTimeSec: number;
    layerHeight: number;
    firstLayerHeight: number;
    thumbnailB64: string;
    filaments: GcodeFilamentInfo[];
    objects: string[];
}

function headAndTail(data: Buffer, head: number, tail: number): string {
    const h = data.subarray(0, Math.min(head, data.length)).toString('utf8');
    const t = data.length > tail ? data.subarray(data.length - tail).toString('utf8') : '';
    return `${h}\n${t}`;
}

export function parseEstimatedTime(data: Buffer): number {
    const text = headAndTail(data, 16384, 65536);
    const m =
        /;\s*total estimated time:\s*(.*)/.exec(text) ??
        /;\s*estimated printing time \(normal mode\)\s*=\s*(.*)/.exec(text);
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
    const layerHeight = grab(/;\s*layer_height\s*=\s*([0-9.]+)/);
    const firstLayerHeight =
        grab(/;\s*initial_layer_print_height\s*=\s*([0-9.]+)/) ||
        grab(/;\s*first_layer_height\s*=\s*([0-9.]+)/) ||
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

    for (const line of header.split('\n')) {
        if (/^\s*;\s*filament_colour\s*=/.test(line)) {
            colors = splitList(line.split('=').slice(1).join('='), ';').map(stripHash);
        } else if (/^\s*;\s*filament_multi_colour\s*=/.test(line) && colors.length === 0) {
            colors = splitList(line.split('=').slice(1).join('='), ';').map(stripHash);
        } else if (/^\s*;\s*filament_type\s*=/.test(line)) {
            materials = splitList(line.split('=').slice(1).join('='), /[;,]/);
            paintCountHint = Math.max(paintCountHint, materials.length);
        } else if (/^\s*;\s*filament_density\s*:/.test(line) || /^\s*;\s*filament_diameter\s*:/.test(line)) {
            const parts = splitList(line.split(':').slice(1).join(':'), /[;,]/);
            paintCountHint = Math.max(paintCountHint, parts.length);
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
    };
}

export function extractObjectNames(data: Buffer): string[] {
    const text = headAndTail(data, 2 * 1024 * 1024, 256 * 1024);
    const names = new Set<string>();
    const re = /^EXCLUDE_OBJECT_DEFINE\s+NAME=(\S+)/gm;
    for (const m of text.matchAll(re)) names.add(m[1]);
    return [...names];
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
