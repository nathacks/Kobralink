export interface StatsBucket {
    key: string;
    jobs: number;
    completed: number;
    durationSec: number;
    filamentMm: number;
}

export interface StatsFileEntry {
    filename: string;
    fileId: string | null;
    thumbnail: string | null;
    jobs: number;
    completed: number;
    durationSec: number;
    filamentMm: number;
    lastPrintedAt: string;
}

export interface StatsMaterialEntry {
    material: string;
    filamentMm: number;
    weightG: number;
    jobs: number;
}

export interface StatsPrinterEntry {
    printerId: string;
    name: string;
    jobs: number;
    completed: number;
    durationSec: number;
    filamentMm: number;
    weightG: number;
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
    firstJobAt: string | null;
    lastJobAt: string | null;
    daily: StatsBucket[];
    months: StatsBucket[];
    weekdays: StatsBucket[];
    hours: StatsBucket[];
    printers: StatsPrinterEntry[];
    topFiles: StatsFileEntry[];
    materials: StatsMaterialEntry[];
}
