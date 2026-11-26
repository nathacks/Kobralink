import type { PrinterFeatures } from './features';

export type KlipperPrintState = 'standby' | 'printing' | 'paused' | 'complete' | 'error';

export const PREPARING_KOBRA_STATES = [
    'preheating',
    'auto_leveling',
    'vibrating',
    'flow_calibrating',
    'checking',
    'updated',
    'init',
    'drying',
    'downloading',
    'slicing',
    'waiting',
    'hotbed_heating',
    'hotbed_cooling_off',
    'nozzle_heating',
    'nozzle_cooling',
    'nozzle_cooling_off',
    'nozzle_purging',
    'nozzle_wiping',
    'frequency_sweeping',
    'z_offset_calibrating',
    'filament_cutting',
    'extfilbox_filament_feeding',
    'extfilbox_filament_unfeeding',
    'ace_filament_feeding',
    'ace_filament_unfeeding',
] as const;

export type PreparingKobraState = (typeof PREPARING_KOBRA_STATES)[number];

export type KobraState =
    | 'free'
    | 'busy'
    | 'printing'
    | PreparingKobraState
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
    remainingPct?: number;
    source?: AceSlotSource;
    colors?: [number, number, number][];
}

export type AceSlotSource = 'rfid' | 'manual' | 'unknown';

export const ACE_SLOT_SOURCES: Record<number, AceSlotSource> = { 0: 'rfid', 1: 'manual', 2: 'unknown' };

export type AceSlotStatus =
    | 'feeding'
    | 'unloading'
    | 'shifting'
    | 'no_spool'
    | 'ready'
    | 'shift_error'
    | 'preloading'
    | 'reading_rfid';

const ACE_SLOT_STATUSES: Record<number, AceSlotStatus> = {
    1: 'feeding',
    2: 'unloading',
    3: 'shifting',
    4: 'no_spool',
    5: 'ready',
    6: 'shift_error',
    7: 'preloading',
    8: 'reading_rfid',
};

export function aceSlotStatus(status: number): AceSlotStatus | null {
    return ACE_SLOT_STATUSES[status] ?? null;
}

export const ACE_DRYING_ON = 1;
export const ACE_DRYING_FAULT = 2;

export interface PrinterPeripherals {
    camera: boolean;
    usbDrive: boolean;
    ace: boolean;
}

export function readPeripherals(raw: unknown): PrinterPeripherals | null {
    if (!raw || typeof raw !== 'object') return null;
    const d = raw as Record<string, unknown>;
    const flag = (v: unknown) => v === true || v === 1;
    if (!['camera', 'udisk', 'multiColorBox'].some((k) => k in d)) return null;
    return { camera: flag(d.camera), usbDrive: flag(d.udisk), ace: flag(d.multiColorBox) };
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
    position: ToolheadPosition | null;
    printSlots: PrintSlots | null;
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
    fileReadyTs: number;
    errorCode: number;
    pauseMsg: string;
    filamentMode: FilamentMode;
    amsSlots: AmsSlot[];
    amsLoadedSlot: number;
    externalSpoolOnly: boolean;
    aceUnits: AceUnit[];
    aceDrying: AceDrying;
    skippedObjects: string[];
    skipTs: number;
    manualOffline: boolean;
    storageTotalMb: number;
    storageUsedMb: number;
    features: PrinterFeatures | null;
    peripherals: PrinterPeripherals | null;
    updatedAt: number;
}

export interface PrintSlots {
    filename: string;
    slots: number[];
}

export interface ToolheadPosition {
    x: number;
    y: number;
    z: number;
}

export const POSITION_POLL_MS = 1000;

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
    ...Object.fromEntries(PREPARING_KOBRA_STATES.map((s) => [s, 'printing' as const])),
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

export function slotUsableForPrint(slot: AmsSlot, mode: FilamentMode): boolean {
    if (slot.status !== 5) return false;
    if (mode === 'ace_hub') return true;
    if (mode === 'ace_direct') return slot.boxId >= 0;
    return slot.boxId === -1;
}

export const PRE_PRINT_STATES: ReadonlySet<string> = new Set(PREPARING_KOBRA_STATES);
export const ACTIVE_PRINT_STATES: ReadonlySet<string> = new Set([
    'printing',
    ...PREPARING_KOBRA_STATES.filter((s) => s !== 'updated'),
]);

export function isPreparing(kobraState: string, currLayer = 0): boolean {
    return PRE_PRINT_STATES.has(kobraState) && !(currLayer > 0);
}

export function isCalibrating(
    state: Pick<PrinterLiveState, 'printState' | 'kobraState'> & Partial<Pick<PrinterLiveState, 'currLayer'>>,
): boolean {
    return state.printState === 'printing' && isPreparing(state.kobraState, state.currLayer);
}
export const TERMINAL_PRINT_STATES = new Set(['finished', 'stoped', 'canceled']);
