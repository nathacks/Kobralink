import type { AmsSlot, FilamentMode } from '@kobralink/shared';
import { rgbToHex } from '@/lib/color';

export const HEAD_INLETS = 4;
const NO_SPOOL = 4;
const HUB_INLET = 3;

export interface ToolheadFeed {
    fanSpeed: number;
    channel: number | null;
    loaded: string | null;
    inlets: (string | null)[];
}

function filament(slot: AmsSlot | undefined): string | null {
    return slot && slot.status !== NO_SPOOL ? rgbToHex(slot.color) : null;
}

export function toolheadFeed(slots: AmsSlot[], loaded: number, mode: FilamentMode, fanSpeed: number): ToolheadFeed {
    const loadedSlot = slots.find((s) => s.globalIndex === loaded);
    const inlets = Array.from({ length: HEAD_INLETS }, (_, i) =>
        filament(slots.find((s) => s.boxId === -1 && s.index === i)),
    );
    if (mode === 'ace_hub' && loaded >= HUB_INLET) inlets[HUB_INLET] = filament(loadedSlot);
    return {
        fanSpeed,
        channel: loaded >= 0 ? Math.min(loaded, HUB_INLET) + 1 : null,
        loaded: filament(loadedSlot),
        inlets,
    };
}
