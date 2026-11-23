import {
    type AceSlotSource,
    type AceSlotStatus,
    type ConnectionError,
    type FilamentMode,
    printerErrorMessageId,
} from '@kobralink/shared';
import { m } from '@/lib/i18n';

export const FILAMENT_MODE_LABEL: Record<FilamentMode, () => string> = {
    toolhead: m.filament_mode_toolhead,
    ace_direct: m.filament_mode_ace_direct,
    ace_hub: m.filament_mode_ace_hub,
};

export const AMS_ACTIVITY_LABEL: Record<string, () => string> = {
    heating: m.ams_activity_heating,
    feeding: m.ams_activity_feeding,
    retracting: m.ams_activity_retracting,
    loaded: m.ams_activity_loaded,
};

export const ACE_SLOT_STATUS_LABEL: Partial<Record<AceSlotStatus, () => string>> = {
    feeding: m.ace_slot_status_feeding,
    unloading: m.ace_slot_status_unloading,
    shifting: m.ace_slot_status_shifting,
    shift_error: m.ace_slot_status_shift_error,
    preloading: m.ace_slot_status_preloading,
    reading_rfid: m.ace_slot_status_reading_rfid,
};

export const ACE_SLOT_SOURCE_LABEL: Record<AceSlotSource, () => string> = {
    rfid: m.ace_slot_source_rfid,
    manual: m.ace_slot_source_manual,
    unknown: m.ace_slot_source_unknown,
};

export const JOB_STATUS_LABEL: Record<string, () => string> = {
    printing: m.job_printing,
    completed: m.job_completed,
    cancelled: m.job_cancelled,
    error: m.job_error,
};

export const KOBRA_STATE_LABEL: Record<string, () => string> = {
    free: m.state_free,
    busy: m.state_busy,
    printing: m.state_printing,
    preheating: m.state_preheating,
    auto_leveling: m.state_auto_leveling,
    vibrating: m.state_vibrating,
    flow_calibrating: m.state_flow_calibrating,
    checking: m.state_checking,
    updated: m.state_updated,
    init: m.state_init,
    drying: m.state_drying,
    downloading: m.state_downloading,
    slicing: m.state_slicing,
    waiting: m.state_waiting,
    hotbed_heating: m.state_hotbed_heating,
    hotbed_cooling_off: m.state_hotbed_cooling,
    nozzle_heating: m.state_nozzle_heating,
    nozzle_cooling: m.state_nozzle_cooling,
    nozzle_cooling_off: m.state_nozzle_cooling,
    nozzle_purging: m.state_nozzle_purging,
    nozzle_wiping: m.state_nozzle_wiping,
    frequency_sweeping: m.state_frequency_sweeping,
    z_offset_calibrating: m.state_z_offset_calibrating,
    filament_cutting: m.state_filament_cutting,
    extfilbox_filament_feeding: m.state_filament_loading,
    extfilbox_filament_unfeeding: m.state_filament_unloading,
    ace_filament_feeding: m.state_filament_loading,
    ace_filament_unfeeding: m.state_filament_unloading,
    pausing: m.state_pausing,
    paused: m.state_paused,
    pause: m.state_paused,
    resuming: m.state_resuming,
    resumed: m.state_resuming,
    stopping: m.state_stopping,
    stoped: m.state_stoped,
    finished: m.state_finished,
    failed: m.state_failed,
    canceled: m.state_canceled,
    offline: m.state_offline,
};

export function kobraStateLabel(state: string): string {
    return KOBRA_STATE_LABEL[state]?.() ?? state;
}

export function printerErrorText(code: number | string | null | undefined, msg: string): string {
    const id = printerErrorMessageId(code);
    return id ? m[id]() : msg;
}

export function jobStatusLabel(status: string): string {
    return JOB_STATUS_LABEL[status]?.() ?? status;
}

export const FAILURE_REASON_LABEL: Record<string, () => string> = {
    '': m.failure_reason_none,
    unlabeled: m.failure_reason_none,
    error: m.failure_reason_error,
    spaghetti: m.failure_reason_spaghetti,
    adhesion: m.failure_reason_adhesion,
    clog: m.failure_reason_clog,
    filament_runout: m.failure_reason_filament_runout,
    layer_shift: m.failure_reason_layer_shift,
    power_loss: m.failure_reason_power_loss,
    user_cancel: m.failure_reason_user_cancel,
    other: m.failure_reason_other,
};

export function failureReasonLabel(reason: string): string {
    return FAILURE_REASON_LABEL[reason]?.() ?? reason;
}

export function connectionErrorText(error: ConnectionError | null | undefined): string {
    if (!error) return '';
    switch (error.code) {
        case 'mqtt_auth':
            return m.connection_mqtt_auth();
        case 'mqtt_refused':
            return m.connection_mqtt_refused();
        case 'unreachable':
            return m.connection_unreachable();
        case 'unreachable_ip':
            return m.connection_unreachable_ip({ ip: error.ip ?? '' });
        case 'lost':
            return m.connection_lost({ ip: error.ip ?? '' });
        case 'reconnecting':
            return m.connection_reconnecting();
        case 'manual':
            return m.connection_manual();
        default:
            return error.detail ?? m.common_printer_offline();
    }
}
