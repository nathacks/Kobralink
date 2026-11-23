export const PRINTER_ERROR_MESSAGES = {
    10101: 'printer_error_task_exists',
    10102: 'printer_error_no_task',
    10105: 'printer_error_download_failed',
    10106: 'printer_error_disk_full',
    10107: 'printer_error_filament_abnormal',
    10110: 'printer_error_reslice',
    10111: 'printer_error_abnormal_end',
    10113: 'printer_error_reslice',
    10115: 'printer_error_unreadable_file',
    10117: 'printer_error_device_abnormal',
    10118: 'printer_error_home_x',
    10119: 'printer_error_home_y',
    10120: 'printer_error_home_z',
    10121: 'printer_error_bed_heating',
    10122: 'printer_error_nozzle_heating',
    10123: 'printer_error_bed_sensor',
    10124: 'printer_error_nozzle_sensor',
    10133: 'printer_error_gcode_commands',
    10134: 'printer_error_camera_disconnected',
    10135: 'printer_error_usb_disconnected',
    10136: 'printer_error_camera_usb_disconnected',
    10236: 'printer_error_nozzle_mismatch',
    10237: 'printer_error_leveling_failed',
    10238: 'printer_error_home_x',
    10239: 'printer_error_home_y',
    10240: 'printer_error_home_z',
    10242: 'printer_error_range_x',
    10243: 'printer_error_range_y',
    10244: 'printer_error_range_z',
    10303: 'printer_error_power_loss',
    10401: 'printer_error_user_pause',
    10402: 'printer_error_out_of_filament',
    10403: 'printer_error_interrupted',
    10601: 'printer_error_user_stop',
    10607: 'printer_error_forced_stop',
    10901: 'printer_error_not_homed',
    10902: 'printer_error_out_of_travel',
    11518: 'printer_error_clog',
    11519: 'printer_error_tangle',
    11520: 'printer_error_ace_empty',
    11532: 'printer_error_color_change_timeout',
    11801: 'printer_error_spaghetti',
    11842: 'printer_error_tangle_or_clog',
} as const satisfies Record<number, `printer_error_${string}`>;

export type PrinterErrorMessageId = (typeof PRINTER_ERROR_MESSAGES)[keyof typeof PRINTER_ERROR_MESSAGES];

export const PRINTER_ERROR_CODES: readonly number[] = Object.keys(PRINTER_ERROR_MESSAGES).map(Number);

export function printerErrorMessageId(code: number | string | null | undefined): PrinterErrorMessageId | null {
    const n = Number(code);
    if (!Number.isInteger(n)) return null;
    return (PRINTER_ERROR_MESSAGES as Record<number, PrinterErrorMessageId>)[n] ?? null;
}
