import type { Layout } from 'react-grid-layout';

export type WidgetId =
    | 'activity'
    | 'print'
    | 'camera'
    | 'ams'
    | 'controls'
    | 'files'
    | 'axes'
    | 'temperature'
    | 'queue'
    | 'macros';

export const WIDGETS: WidgetId[] = [
    'activity',
    'print',
    'camera',
    'ams',
    'controls',
    'files',
    'axes',
    'temperature',
    'queue',
    'macros',
];

export const COLS = 12;
export const ROW_HEIGHT = 24;

export const DEFAULT_LAYOUT: Layout = [
    { i: 'activity', x: 0, y: 0, w: 8, h: 10, minW: 4, minH: 8 },
    { i: 'print', x: 8, y: 0, w: 4, h: 10, minW: 3, minH: 9 },
    { i: 'camera', x: 0, y: 10, w: 8, h: 15, minW: 4, minH: 8 },
    { i: 'ams', x: 8, y: 10, w: 4, h: 6, minW: 3, minH: 6 },
    { i: 'controls', x: 8, y: 16, w: 4, h: 8, minW: 3, minH: 8 },
    { i: 'temperature', x: 0, y: 25, w: 8, h: 8, minW: 4, minH: 7 },
    { i: 'axes', x: 8, y: 24, w: 4, h: 9, minW: 3, minH: 9 },
    { i: 'macros', x: 0, y: 33, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'queue', x: 4, y: 33, w: 8, h: 7, minW: 4, minH: 6 },
    { i: 'files', x: 0, y: 40, w: 12, h: 16, minW: 4, minH: 12 },
];

export interface LayoutPreset {
    name: string;
    layout: Layout;
}

const LAYOUT_KEY = (printerId: string) => `kobralink.layout.${printerId}`;
const PRESETS_KEY = 'kobralink.layout.presets';

function read<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function write(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {}
}

export function sanitize(layout: Layout | null | undefined): Layout {
    if (!Array.isArray(layout)) return DEFAULT_LAYOUT;
    const byId = new Map(layout.filter((l) => WIDGETS.includes(l.i as WidgetId)).map((l) => [l.i, l]));
    return DEFAULT_LAYOUT.map((d) => {
        const saved = byId.get(d.i);
        return saved ? { ...d, x: saved.x, y: saved.y, w: saved.w, h: Math.max(saved.h, d.minH ?? 0) } : d;
    });
}

export function loadLayout(printerId: string): Layout {
    return sanitize(read<Layout>(LAYOUT_KEY(printerId)));
}

export function saveLayout(printerId: string, layout: Layout): void {
    write(
        LAYOUT_KEY(printerId),
        layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
    );
}

export function clearLayout(printerId: string): void {
    try {
        localStorage.removeItem(LAYOUT_KEY(printerId));
    } catch {}
}

export function loadPresets(): LayoutPreset[] {
    return (read<LayoutPreset[]>(PRESETS_KEY) ?? []).filter((p) => p && typeof p.name === 'string');
}

export function savePreset(name: string, layout: Layout): LayoutPreset[] {
    const next = loadPresets().filter((p) => p.name !== name);
    next.push({ name, layout: layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) });
    next.sort((a, b) => a.name.localeCompare(b.name));
    write(PRESETS_KEY, next);
    return next;
}

export function deletePreset(name: string): LayoutPreset[] {
    const next = loadPresets().filter((p) => p.name !== name);
    write(PRESETS_KEY, next);
    return next;
}
