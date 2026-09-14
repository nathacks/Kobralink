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
}

export interface StatsMaterialEntry {
    material: string;
    filamentMm: number;
    weightG: number;
    jobs: number;
}

export interface StatsDto {
    totalJobs: number;
    completed: number;
    cancelled: number;
    errored: number;
    successRate: number;
    totalDurationSec: number;
    avgDurationSec: number;
    longestDurationSec: number;
    totalFilamentMm: number;
    totalFilamentG: number;
    months: StatsBucket[];
    weekdays: StatsBucket[];
    topFiles: StatsFileEntry[];
    materials: StatsMaterialEntry[];
}
