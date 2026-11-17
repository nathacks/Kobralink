import type { CostSettings } from './settings';

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
