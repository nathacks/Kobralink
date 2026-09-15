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

export type ConnectionErrorCode =
    | 'mqtt_auth'
    | 'mqtt_refused'
    | 'unreachable'
    | 'unreachable_ip'
    | 'lost'
    | 'reconnecting'
    | 'manual'
    | 'other';

export interface ConnectionError {
    code: ConnectionErrorCode;
    ip?: string;
    detail?: string;
}

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

export interface AceDrying {
    status: number;
    targetTemp: number;
    duration: number;
    remainTime: number;
    humidity: number | null;
    currentTemp: number | null;
}

export interface AceUnit {
    id: number;
    autoFeed: boolean;
    drying: AceDrying;
}

export interface PrinterLiveState {
    printerId: string;
    connected: boolean;
    connectionError: ConnectionError | null;
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
    printTimeAt: number;
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
    aceUnits: AceUnit[];
    aceDrying: AceDrying;
    skippedObjects: string[];
    skipTs: number;
    manualOffline: boolean;
    storageTotalMb: number;
    storageUsedMb: number;
    updatedAt: number;
}

export interface PrinterSample {
    t: number;
    nozzle: number;
    bed: number;
    progress: number;
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
