export type DetectionModelState = 'missing' | 'downloading' | 'ready' | 'error';

export interface DetectionModelDto {
    state: DetectionModelState;
    progress: number;
    sizeBytes: number;
    downloadedBytes: number;
    error: string;
}

export interface DetectionBox {
    x: number;
    y: number;
    w: number;
    h: number;
    confidence: number;
}

export interface PrinterDetectionDto {
    active: boolean;
    frames: number;
    score: number;
    failing: boolean;
    lastAt: number;
    lastInferenceMs: number;
    boxes: DetectionBox[];
    triggeredAt: number;
}

export interface FailureDetectionStatusDto {
    runtimeAvailable: boolean;
    runtimeError: string;
    model: DetectionModelDto;
    printers: Record<string, PrinterDetectionDto>;
}
