export interface StatsBucket {
    key: string;
    jobs: number;
    completed: number;
    durationSec: number;
    filamentMm: number;
    cost: number;
}

export interface StatsFileEntry {
    filename: string;
    fileId: string | null;
    thumbnail: string | null;
    jobs: number;
    completed: number;
    durationSec: number;
    filamentMm: number;
    cost: number;
    lastPrintedAt: string;
}

export interface StatsMaterialEntry {
    material: string;
    filamentMm: number;
    weightG: number;
    cost: number;
    jobs: number;
}

export interface StatsPrinterEntry {
    printerId: string;
    name: string;
    jobs: number;
    completed: number;
    failed: number;
    durationSec: number;
    filamentMm: number;
    weightG: number;
    cost: number;
    utilization: number | null;
    mtbfSec: number | null;
    idleAfterSec: number | null;
    estimateRatio: number | null;
    energyKwh: number | null;
}

export interface StatsWasteEntry {
    jobs: number;
    filamentMm: number;
    weightG: number;
    filamentCost: number;
}

export interface StatsWaste {
    paused: StatsWasteEntry;
    cancelled: StatsWasteEntry;
}

export interface StatsFailureEntry {
    reason: string;
    count: number;
}

export interface StatsSummary {
    totalJobs: number;
    successRate: number;
    totalDurationSec: number;
    utilization: number | null;
    totalFilamentG: number;
    totalCost: number;
}

export interface StatsDto {
    totalJobs: number;
    completed: number;
    cancelled: number;
    errored: number;
    inProgress: number;
    successRate: number;
    totalDurationSec: number;
    completedDurationSec: number;
    avgDurationSec: number;
    longestDurationSec: number;
    estimatedDurationSec: number;
    estimateRatio: number | null;
    totalFilamentMm: number;
    totalFilamentG: number;
    totalCost: number;
    filamentCost: number;
    energyCost: number;
    unpricedG: number;
    currency: string;
    firstJobAt: string | null;
    lastJobAt: string | null;
    daily: StatsBucket[];
    months: StatsBucket[];
    weekdays: StatsBucket[];
    hours: StatsBucket[];
    printers: StatsPrinterEntry[];
    topFiles: StatsFileEntry[];
    materials: StatsMaterialEntry[];
    failures: StatsFailureEntry[];
    waste: StatsWaste;
    utilization: number | null;
    previous: StatsSummary | null;
    energyKwh: number | null;
}
