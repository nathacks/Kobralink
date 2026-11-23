const SPEED_FACTORS: Record<number, number> = { 1: 0.5, 2: 1.0, 3: 1.3 };

export function speedFactor(mode: number): number {
    return SPEED_FACTORS[mode] ?? 1.0;
}
