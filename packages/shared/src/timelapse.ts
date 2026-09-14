export interface TimelapseDto {
    id: string;
    printerId: string;
    jobId: string | null;
    filename: string;
    frames: number;
    sizeBytes: number;
    durationSec: number;
    status: 'recording' | 'rendering' | 'ready' | 'error';
    createdAt: string;
}
