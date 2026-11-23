export const FILAMENT_MARGIN = { ratio: 0.05, grams: 5 };

export type FilamentStatus = 'ok' | 'tight' | 'short' | 'unknown';

export interface FilamentNeed {
    slotKey: string;
    colorHex: string;
    needG: number | null;
}

export interface SlotCheck {
    slotKey: string;
    colorHex: string;
    needG: number | null;
    remainingG: number | null;
    status: FilamentStatus;
}

export function filamentStatus(needG: number | null, remainingG: number | null): FilamentStatus {
    if (needG === null || remainingG === null) return 'unknown';
    if (remainingG < needG) return 'short';
    if (remainingG < needG * (1 + FILAMENT_MARGIN.ratio) + FILAMENT_MARGIN.grams) return 'tight';
    return 'ok';
}

export function checkFilament(needs: FilamentNeed[], remaining: (slotKey: string) => number | undefined): SlotCheck[] {
    const bySlot = new Map<string, { colorHex: string; needG: number | null }>();
    for (const need of needs) {
        const cur = bySlot.get(need.slotKey);
        if (!cur) {
            bySlot.set(need.slotKey, { colorHex: need.colorHex, needG: need.needG });
            continue;
        }
        cur.needG = cur.needG === null || need.needG === null ? null : cur.needG + need.needG;
    }
    return [...bySlot].map(([slotKey, { colorHex, needG }]) => {
        const left = remaining(slotKey);
        const remainingG = left === undefined ? null : left;
        return { slotKey, colorHex, needG, remainingG, status: filamentStatus(needG, remainingG) };
    });
}

export function anyShort(checks: SlotCheck[]): boolean {
    return checks.some((c) => c.status === 'short');
}
