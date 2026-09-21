import type { AmsBoxMappingEntry, KobraBoxSlot, KobraColorBox, KobraDryingStatus } from '@kobralink/kobra-protocol';
import {
    type AceDrying,
    type AceUnit,
    type AmsSlot,
    type FilamentAssignment,
    type FilamentMode,
    type GcodeFilament,
    slotUsableForPrint,
} from '@kobralink/shared';

export function detectFilamentMode(boxes: KobraColorBox[]): FilamentMode {
    const toolhead = boxes.some((b) => b.id === -1);
    const ace = boxes.some((b) => (b.id ?? -1) >= 0);
    if (ace && toolhead) return 'ace_hub';
    if (ace) return 'ace_direct';
    return 'toolhead';
}

function toSlot(raw: KobraBoxSlot, globalIndex: number, boxId: number): AmsSlot {
    const c = Array.isArray(raw.color) && raw.color.length >= 3 ? raw.color : [255, 255, 255];
    return {
        globalIndex,
        boxId,
        index: Number(raw.index ?? globalIndex),
        status: Number(raw.status ?? 0),
        type: String(raw.type ?? ''),
        color: [Number(c[0]), Number(c[1]), Number(c[2])],
        rfid: raw.rfid !== undefined ? Number(raw.rfid) : undefined,
        sku: raw.sku !== undefined ? String(raw.sku) : undefined,
        activity: '',
    };
}

export function aggregateSlots(boxes: KobraColorBox[], mode: FilamentMode): { slots: AmsSlot[]; loaded: number } {
    const toolhead = boxes.find((b) => b.id === -1);
    const aceBoxes = boxes.filter((b) => (b.id ?? -1) >= 0).sort((a, b) => a.id - b.id);
    const slots: AmsSlot[] = [];
    let loaded = -1;

    if (mode === 'toolhead') {
        if (toolhead) {
            (toolhead.slots ?? []).forEach((s, i) => {
                slots.push(toSlot(s, i, -1));
            });
            if ((toolhead.loaded_slot ?? -1) >= 0) loaded = toolhead.loaded_slot as number;
        }
        return { slots, loaded };
    }

    if (mode === 'ace_direct') {
        for (const ace of aceBoxes) {
            const base = ace.id * 4;
            (ace.slots ?? []).slice(0, 4).forEach((s, i) => {
                slots.push(toSlot(s, base + i, ace.id));
            });
            const l = ace.loaded_slot ?? -1;
            if (l >= 0 && l < 4) loaded = base + l;
        }
        return { slots, loaded };
    }

    if (toolhead) {
        (toolhead.slots ?? []).slice(0, 3).forEach((s, i) => {
            slots.push(toSlot(s, i, -1));
        });
        const l = toolhead.loaded_slot ?? -1;
        if (l >= 0 && l <= 2) loaded = l;
    }
    for (const ace of aceBoxes) {
        const base = 3 + ace.id * 4;
        (ace.slots ?? []).forEach((s, i) => {
            slots.push(toSlot(s, base + i, ace.id));
        });
        const l = ace.loaded_slot ?? -1;
        if (l >= 0) loaded = base + l;
    }
    return { slots, loaded };
}

export function slotActivityMap(boxes: KobraColorBox[], globalLoaded: number, mode: FilamentMode): Map<number, string> {
    const map = new Map<number, string>();
    for (const box of boxes) {
        const fs = box.feed_status;
        if (!fs || fs.slot_index === undefined) continue;
        const local = Number(fs.slot_index);
        const boxId = Number(box.id ?? -1);
        let global: number;
        if (mode === 'ace_direct') global = boxId * 4 + local;
        else if (mode === 'ace_hub') global = boxId >= 0 ? 3 + boxId * 4 + local : local;
        else global = local;
        const st = Number(fs.current_status ?? 0);

        if (st === 10) map.set(global, 'feeding');
        else if (st === 11) map.set(global, 'retracting');
    }
    if (globalLoaded >= 0 && !map.has(globalLoaded)) map.set(globalLoaded, 'loaded');
    return map;
}

export function slotToPrintAmsIndex(slot: AmsSlot, mode: FilamentMode): number {
    if (mode === 'ace_hub' && slot.boxId >= 0) return 4 + slot.boxId * 4 + slot.index;
    return slot.globalIndex;
}

function rgba(slot: AmsSlot): [number, number, number, number] {
    return [slot.color[0], slot.color[1], slot.color[2], 255];
}

function hexRgba(hex: string): [number, number, number, number] {
    const n = Number.parseInt(hex.replace('#', ''), 16);
    if (!Number.isFinite(n)) return [255, 255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function buildAssignedAmsBoxMapping(
    assignments: FilamentAssignment[],
    filaments: GcodeFilament[],
    slots: AmsSlot[],
    mode: FilamentMode,
): { mapping: AmsBoxMappingEntry[]; unused: number; invalid: number } {
    const mapping: AmsBoxMappingEntry[] = [];
    let unused = 0;
    let invalid = 0;
    for (const a of assignments) {
        if (a.isUsed === false || a.slotIndex < 0) {
            unused++;
            continue;
        }
        const slot = slots.find((s) => s.globalIndex === a.slotIndex);
        if (!slot || !slotUsableForPrint(slot, mode)) {
            invalid++;
            continue;
        }
        const paint = filaments.find((f) => f.slotIndex === a.paintIndex);
        mapping.push({
            paint_index: a.paintIndex,
            ams_index: slotToPrintAmsIndex(slot, mode),
            paint_color: paint ? hexRgba(paint.colorHex) : [255, 255, 255, 255],
            ams_color: rgba(slot),
            material_type: slot.type || paint?.material || 'PLA',
        });
    }
    return { mapping, unused, invalid };
}

export function buildAutoAmsBoxMapping(loaded: AmsSlot[], mode: FilamentMode): AmsBoxMappingEntry[] {
    if (!loaded.length) return [];
    const byIndex = new Map(loaded.map((s) => [s.globalIndex, s]));
    const maxIdx = Math.max(...byIndex.keys());
    const fallback = byIndex.get(maxIdx) as AmsSlot;
    const out: AmsBoxMappingEntry[] = [];
    for (let i = 0; i <= maxIdx; i++) {
        const s = byIndex.get(i) ?? fallback;
        out.push({
            paint_index: i,
            ams_index: slotToPrintAmsIndex(s, mode),
            paint_color: [255, 255, 255, 255],
            ams_color: rgba(s),
            material_type: s.type || 'PLA',
        });
    }
    return out;
}

export function globalToBoxSlot(
    slots: AmsSlot[],
    globalIndex: number,
    mode: FilamentMode,
): { boxId: number; localSlot: number } {
    const found = slots.find((s) => s.globalIndex === globalIndex);
    if (found) return { boxId: found.boxId, localSlot: found.index };
    const acePresent = slots.some((s) => s.boxId >= 0);
    if (mode === 'ace_direct' && acePresent) return { boxId: Math.floor(globalIndex / 4), localSlot: globalIndex % 4 };
    if (!acePresent || globalIndex < 3) return { boxId: -1, localSlot: globalIndex };
    const offset = globalIndex - 3;
    return { boxId: Math.floor(offset / 4), localSlot: offset % 4 };
}

export const EMPTY_DRYING: AceDrying = {
    status: 0,
    targetTemp: 0,
    duration: 0,
    remainTime: 0,
    humidity: null,
    currentTemp: null,
};

function num(src: Record<string, unknown> | undefined, keys: string[]): number | null {
    if (!src) return null;
    for (const k of keys) {
        const v = src[k];
        if (v === undefined || v === null) continue;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function minutes(v: unknown): number {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return 0;
    return n > 24 * 60 ? Math.max(0, Math.round(n / 60)) : Math.max(0, Math.trunc(n));
}

function toDrying(box: KobraColorBox, raw: KobraDryingStatus | undefined): AceDrying {
    const src = raw ?? {};
    return {
        status: Number(src.status ?? 0),
        targetTemp: Number(src.target_temp ?? 0),
        duration: minutes(src.duration),
        remainTime: minutes(src.remain_time),
        humidity:
            num(src, ['humidity', 'current_humidity', 'cur_humidity', 'relative_humidity', 'humidity_value']) ??
            num(box, ['humidity']),
        currentTemp:
            num(src, ['current_temp', 'cur_temp', 'temperature', 'temp', 'drying_temp', 'chamber_temp']) ??
            num(box, ['current_temp']),
    };
}

export function aggregateAceUnits(
    boxes: KobraColorBox[],
    previous: AceUnit[],
): { units: AceUnit[]; drying: AceDrying } {
    const units: AceUnit[] = [];
    for (const box of boxes) {
        const id = Number(box.id ?? -1);
        if (id < 0 || id > 3) continue;
        const prev = previous.find((u) => u.id === id);
        const raw = box.drying_status ?? box.drying_settings;
        units.push({
            id,
            autoFeed: box.auto_feed !== undefined ? Number(box.auto_feed) === 1 : (prev?.autoFeed ?? false),
            drying: raw ? toDrying(box, raw) : (prev?.drying ?? EMPTY_DRYING),
        });
    }
    units.sort((a, b) => a.id - b.id);
    const active = units.find((u) => u.drying.status !== 0);
    const primary = active ?? units[0];
    return { units, drying: primary ? primary.drying : EMPTY_DRYING };
}
