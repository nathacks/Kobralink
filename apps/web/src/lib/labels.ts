import type { ConnectionError, FilamentMode } from '@kobralink/shared';
import { m } from '@/lib/i18n';

export const FILAMENT_MODE_LABEL: Record<FilamentMode, () => string> = {
    toolhead: m.filament_mode_toolhead,
    ace_direct: m.filament_mode_ace_direct,
    ace_hub: m.filament_mode_ace_hub,
};

export const AMS_ACTIVITY_LABEL: Record<string, () => string> = {
    feeding: m.ams_activity_feeding,
    retracting: m.ams_activity_retracting,
    loaded: m.ams_activity_loaded,
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
    checking: m.state_checking,
    updated: m.state_updated,
    init: m.state_init,
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

export function jobStatusLabel(status: string): string {
    return JOB_STATUS_LABEL[status]?.() ?? status;
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
