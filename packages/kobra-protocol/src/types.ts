export interface KobraMessage<T = unknown> {
    type: string;
    action: string;
    msgid?: string;
    timestamp?: number;
    state?: string;
    code?: number;
    msg?: string;
    data: T;
}

export interface KobraTemp {
    curr_nozzle_temp: number;
    target_nozzle_temp: number;
    curr_hotbed_temp: number;
    target_hotbed_temp: number;
}

export interface KobraInfoData {
    printerName?: string;
    model?: string;
    version?: string;
    state?: string;
    temp?: Partial<KobraTemp>;
    urls?: { fileUploadurl?: string; rtspUrl?: string; [k: string]: string | undefined };
    fan_speed_pct?: number;
    print_speed_mode?: number;
    project?: {
        state?: string;
        filename?: string;
        progress?: number;
        print_time?: number;
        remain_time?: number;
        curr_layer?: number;
        total_layers?: number;
        taskid?: string | number;
    };
    storage?: { total?: number; used?: number };
    features?: Record<string, unknown>;
    [k: string]: unknown;
}

export interface KobraPrintData {
    filename?: string;
    progress?: number;
    print_time?: number;
    remain_time?: number;
    curr_layer?: number;
    total_layers?: number;
    taskid?: string | number;
    supplies_usage?: number;
    settings?: {
        print_speed_mode?: number;
        target_nozzle_temp?: number;
        target_hotbed_temp?: number;
        fan_speed_pct?: number;
        z_comp?: number;
    };
    [k: string]: unknown;
}

export interface KobraBoxSlot {
    index: number;
    status: number;
    type: string;
    color: number[];
    rfid?: number;
    sku?: string;
    [k: string]: unknown;
}

export interface KobraDryingStatus {
    status?: number;
    target_temp?: number;
    duration?: number;
    remain_time?: number;
    humidity?: number;
    current_temp?: number;
    [k: string]: unknown;
}

export interface KobraColorBox {
    id: number;
    loaded_slot?: number;
    auto_feed?: number;
    slots?: KobraBoxSlot[];
    feed_status?: { current_status?: number; slot_index?: number; type?: number };
    drying_status?: KobraDryingStatus;
    drying_settings?: KobraDryingStatus;
    [k: string]: unknown;
}

export interface KobraMultiColorBoxData {
    head_tools_model?: number;
    multi_color_box?: KobraColorBox[];
    [k: string]: unknown;
}

export const CAMERA_LIGHT_TYPE = 3;

export interface KobraLight {
    status?: number | null;
    brightness?: number | null;
    type?: number;
}

export interface KobraPeripheralsData {
    camera?: number | boolean;
    udisk?: number | boolean;
    multiColorBox?: number | boolean;
    [k: string]: unknown;
}

export interface KobraLightData extends KobraLight {
    lights?: KobraLight[];
}

export interface KobraFanData {
    fan_speed_pct?: number | null;
    aux_fan_speed_pct?: number | null;
    box_fan_level?: number | null;
    taskid?: string | number;
    [k: string]: unknown;
}

export interface KobraSkipData {
    objects_skip_parts?: string[];
    skipped?: string[];
    skipped_parts?: string[];
    [k: string]: unknown;
}

export interface KobraFileRecord {
    filename: string;
    is_dir?: boolean;
    size?: number;
    timestamp?: number;
    [k: string]: unknown;
}

export interface KobraFileData {
    filename?: string;
    records?: KobraFileRecord[];
    total?: number;
    total_count?: number;
    count?: number;
    file_details?: {
        filename?: string;
        thumbnail?: string;
        png_image?: string;
        objects_skip_parts?: string[];
        svg_image?: string;
        [k: string]: unknown;
    };
    [k: string]: unknown;
}

export interface AmsBoxMappingEntry {
    paint_index: number;
    ams_index: number;
    paint_color: [number, number, number, number];
    ams_color: [number, number, number, number];
    material_type: string;
}

export interface PrintStartPayload {
    taskid: string;
    url: string;
    filename: string;
    md5: string;
    filepath: string | null;
    filetype: number;
    project_type: number;
    filesize: number;
    ams_settings: { use_ams: boolean; ams_box_mapping: AmsBoxMappingEntry[] };
    task_settings: {
        auto_leveling: number;
        vibration_compensation: number;
        flow_calibration: number;
        dry_mode: number;
        ai_settings: { status: number; count: number; type: number };
        timelapse: { status: number; count: number; type: number };
        drying_settings: { status: number; target_temp: number; duration: number; remain_time: number };
        model_objects_skip_parts: string[];
    };
}
