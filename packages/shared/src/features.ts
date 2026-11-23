export type PrinterFeatures = Record<string, boolean>;

export const PRINT_OPTION_FEATURES = {
    autoLeveling: 'auto_leveling_support',
    vibrationCompensation: 'vibration_compensation_support',
    flowCalibration: 'flow_calibration_support',
} as const;
export type PrintOption = keyof typeof PRINT_OPTION_FEATURES;

export function readFeatures(raw: unknown): PrinterFeatures | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const features: PrinterFeatures = {};
    for (const [key, value] of Object.entries(raw)) {
        if (value === true || value === 1) features[key] = true;
        else if (value === false || value === 0) features[key] = false;
    }
    return features;
}

export function supportsPrintOption(features: PrinterFeatures | null | undefined, option: PrintOption): boolean {
    if (!features) return true;
    return features[PRINT_OPTION_FEATURES[option]] === true;
}
