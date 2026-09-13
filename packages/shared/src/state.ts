export type KlipperPrintState = 'standby' | 'printing' | 'paused' | 'complete' | 'error';

export type KobraState =
    | 'free'
    | 'busy'
    | 'printing'
    | 'preheating'
    | 'auto_leveling'
    | 'checking'
    | 'updated'
    | 'init'
    | 'pausing'
    | 'paused'
    | 'pause'
    | 'resuming'
    | 'resumed'
    | 'stopping'
    | 'stoped'
    | 'finished'
    | 'failed'
    | 'canceled'
    | 'offline'
    | (string & {});

export type FilamentMode = 'toolhead' | 'ace_direct' | 'ace_hub';

export interface AmsSlot {
    globalIndex: number;

    boxId: number;

    index: number;

    status: number;
    type: string;
    color: [number, number, number];
    rfid?: number;
    sku?: string;
    activity: string;
}

export interface PrinterLiveState {
    printerId: string;
    connected: boolean;
    connectionError: string;
    printerName: string;
    firmwareVersion: string;
    printState: KlipperPrintState;
    kobraState: KobraState;
    nozzleTemp: number;
    nozzleTarget: number;
    bedTemp: number;
    bedTarget: number;

    progress: number;
    printDurationSec: number;
    remainTimeSec: number;
    currLayer: number;
    totalLayers: number;
    zMm: number;
    filename: string;
    slicerTimeSec: number;
    thumbnail: string;
    cameraUrl: string;
    fanSpeed: number;

    printSpeedMode: number;
    lightOn: boolean;
    lightBrightness: number;
    taskId: string;
    fileReady: string;
    errorCode: number;
    pauseMsg: string;
    filamentMode: FilamentMode;
    amsSlots: AmsSlot[];
    amsLoadedSlot: number;
    storageTotalMb: number;
    storageUsedMb: number;
    updatedAt: number;
}

export const KOBRA_TO_KLIPPER_STATE: Record<string, KlipperPrintState> = {
    free: 'standby',
    busy: 'printing',
    printing: 'printing',
    preheating: 'printing',
    auto_leveling: 'printing',
    checking: 'printing',
    updated: 'printing',
    init: 'printing',
    pausing: 'paused',
    paused: 'paused',
    pause: 'paused',
    resuming: 'printing',
    resumed: 'printing',
    stopping: 'printing',
    stoped: 'standby',
    finished: 'complete',
    failed: 'error',
    canceled: 'standby',
    offline: 'error',
};

export const PRE_PRINT_STATES = new Set(['preheating', 'auto_leveling', 'checking', 'updated', 'init']);
export const ACTIVE_PRINT_STATES = new Set(['printing', 'preheating', 'auto_leveling', 'checking', 'init']);
export const TERMINAL_PRINT_STATES = new Set(['finished', 'stoped', 'canceled']);
