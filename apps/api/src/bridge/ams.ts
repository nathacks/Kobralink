import type { AmsBoxMappingEntry, KobraBoxSlot, KobraColorBox } from '@kobralink/kobra-protocol';
import type { AmsSlot, FilamentMode } from '@kobralink/shared';

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

export function slotUsableForPrint(slot: AmsSlot, mode: FilamentMode): boolean {
    if (slot.status !== 5) return false;
    if (mode === 'ace_hub') return true;
    if (mode === 'ace_direct') return slot.boxId >= 0;
    return slot.boxId === -1;
}

function rgba(slot: AmsSlot): [number, number, number, number] {
    return [slot.color[0], slot.color[1], slot.color[2], 255];
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
