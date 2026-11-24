import {
    type CostEstimate,
    estimateCost,
    type GcodeFileDto,
    type SpoolPriceSlot,
    spoolmanPricing,
    spoolPriceFor,
} from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { usePrinter } from '@/hooks/use-printers';
import { appSettingsQuery, spoolmanSpoolsQuery, spoolmanStatusQuery } from '@/lib/queries';

export type CostEstimator = (
    file: Pick<GcodeFileDto, 'filaments' | 'estPrintTimeSec'>,
    assignedSlots?: ReadonlyMap<number, string>,
) => CostEstimate | null;

export function useCostEstimate(printerId: string): { estimate: CostEstimator; currency: string } {
    const settings = useQuery(appSettingsQuery).data;
    const powerW = usePrinter(printerId, (p) => p?.settings.profile.powerW ?? null);
    const spoolman = useQuery(spoolmanStatusQuery(printerId)).data;
    const spools = useQuery(spoolmanSpoolsQuery(Boolean(spoolman?.configured))).data;
    const slots: SpoolPriceSlot[] = Object.entries(spoolman?.slotSpools ?? {}).flatMap(([key, id]) => {
        const spool = spools?.find((s) => s.id === id);
        return spool
            ? [{ key, material: spool.filament.material ?? '', pricePerG: spoolmanPricing(spool)?.pricePerG ?? null }]
            : [];
    });
    const estimate: CostEstimator = (file, assignedSlots) => {
        if (!settings) return null;
        const filaments = file.filaments
            .filter((f) => f.isUsed)
            .map((f) => ({
                material: f.material,
                usedG: f.usedG,
                usedMm: f.usedMm,
                pricePerG: spoolPriceFor(f.material, slots, assignedSlots?.get(f.slotIndex) ?? null),
            }));
        return estimateCost(filaments, file.estPrintTimeSec, {
            defaultPricePerKg: settings.filamentPricePerKg,
            costs: settings.costs,
            printer: { powerW },
        });
    };
    return { estimate, currency: settings?.currency ?? 'EUR' };
}
