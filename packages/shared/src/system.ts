export interface SystemInfoDto {
    version: string;
    runtime: string;
    platform: string;
    dataDir: string;
    uptimeSec: number;
    packaged: 'docker' | 'electron' | 'source';
    lanIps: string[];
    update: { checked: boolean; available: boolean; latest: string; url: string } | null;
}

export interface BackupInfoDto {
    printers: number;
    files: number;
    jobs: number;
    timelapses: number;
    sizeBytes: number;
}
