import { useQuery } from '@tanstack/react-query';
import { EXTERNAL_SLOT } from '@/components/printer/ams/external-spool-form';
import { spoolAssignmentsQuery, spoolmanSpoolsQuery, spoolmanStatusQuery, spoolsQuery } from '@/lib/queries';

export interface SlotSpool {
    hex?: string;
    material?: string;
    name?: string;
    remainingG?: number;
    fraction?: number;
}

export function remainingFraction(remaining: number | undefined, total: number | undefined): number | undefined {
    if (remaining === undefined || !total || total <= 0) return undefined;
    return Math.min(1, Math.max(0, remaining / total));
}

export function useSpoolLookup(printerId: string): (slotKey: string) => SlotSpool {
    const spoolman = useQuery(spoolmanStatusQuery(printerId));
    const spoolmanOn = Boolean(spoolman.data?.configured);
    const spools = useQuery(spoolmanSpoolsQuery(spoolmanOn));
    const localSpools = useQuery(spoolsQuery());
    const localAssign = useQuery(spoolAssignmentsQuery(printerId));
    return (slotKey) => {
        const spoolmanSpool = spools.data?.find((sp) => sp.id === spoolman.data?.slotSpools[slotKey]);
        if (spoolmanSpool) {
            const { filament, remaining_weight, used_weight } = spoolmanSpool;
            return {
                hex: filament.color_hex ? `#${filament.color_hex.replace(/^#/, '')}` : undefined,
                material: filament.material,
                name: [filament.vendor?.name, filament.name].filter(Boolean).join(' ') || undefined,
                remainingG: remaining_weight,
                fraction: remainingFraction(remaining_weight, (remaining_weight ?? 0) + (used_weight ?? 0)),
            };
        }
        if (spoolmanOn) return {};
        const localSpool = localSpools.data?.find((sp) => sp.id === localAssign.data?.slotSpools[slotKey]);
        if (!localSpool) return {};
        return {
            hex: localSpool.colorHex,
            material: localSpool.material,
            name: [localSpool.vendor, localSpool.name].filter(Boolean).join(' ') || undefined,
            remainingG: localSpool.remainingG,
            fraction: remainingFraction(localSpool.remainingG, localSpool.initialWeightG),
        };
    };
}

export function useSlotSpool(printerId: string, slotKey: string): SlotSpool {
    return useSpoolLookup(printerId)(slotKey);
}

export const useExternalSpool = (printerId: string) => useSlotSpool(printerId, EXTERNAL_SLOT);
