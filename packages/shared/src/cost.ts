import { materialFamily } from './filament';
import type { CostSettings } from './settings';
import { filamentWeightG, materialDensity } from './spools';

export interface JobCost {
    filament: number;
    energy: number;
    total: number;
}

export function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

export interface PrinterEnergy {
    powerW?: number | null;
    measuresEnergy?: boolean;
}

export function jobCost(
    durationSec: number,
    filamentCost: number,
    costs: CostSettings,
    printer: PrinterEnergy = {},
    energyKwh: number | null = null,
): JobCost {
    const hours = Math.max(0, durationSec) / 3600;
    const powerW = printer.powerW ?? costs.printerPowerW;
    const kwh = energyKwh ?? (powerW / 1000) * hours;
    const energy = kwh * costs.energyPricePerKwh;
    const filament = Math.max(0, filamentCost);
    return {
        filament: round2(filament),
        energy: round2(energy),
        total: round2(filament + energy),
    };
}

export interface SpoolPriceSlot {
    key: string;
    material: string;
    pricePerG: number | null;
}

export function spoolPriceFor(
    material: string,
    slots: SpoolPriceSlot[],
    assignedKey: string | null = null,
): number | null {
    if (assignedKey !== null) return slots.find((s) => s.key === assignedKey)?.pricePerG ?? null;
    const family = materialFamily(material);
    const matching = slots.filter((s) => !s.material || !family || materialFamily(s.material) === family);
    return matching.find((s) => s.pricePerG !== null)?.pricePerG ?? null;
}

export interface EstimateFilament {
    material: string;
    usedG?: number | null;
    usedMm?: number | null;
    pricePerG: number | null;
}

export interface CostEstimate extends JobCost {
    weightG: number;
    unpricedG: number;
}

export function estimateCost(
    filaments: EstimateFilament[],
    estPrintTimeSec: number,
    options: { defaultPricePerKg: number; costs: CostSettings; printer?: PrinterEnergy },
): CostEstimate | null {
    const defaultPerG = options.defaultPricePerKg > 0 ? options.defaultPricePerKg / 1000 : null;
    let weightG = 0;
    let unpricedG = 0;
    let filamentCost = 0;
    for (const f of filaments) {
        const g = f.usedG ?? (f.usedMm ? filamentWeightG(f.usedMm, 1.75, materialDensity(f.material)) : 0);
        if (!(g > 0)) continue;
        weightG += g;
        const perG = f.pricePerG ?? defaultPerG;
        if (perG === null) unpricedG += g;
        else filamentCost += g * perG;
    }
    const cost = jobCost(estPrintTimeSec, filamentCost, options.costs, options.printer);
    if (cost.total <= 0) return null;
    return { ...cost, weightG: round2(weightG), unpricedG: round2(unpricedG) };
}
