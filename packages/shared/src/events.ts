export type KobralinkEventType =
    | 'print_started'
    | 'print_finished'
    | 'print_cancelled'
    | 'print_paused'
    | 'printer_offline'
    | 'printer_online'
    | 'drying_done'
    | 'alert_nozzle_temp'
    | 'alert_bed_temp'
    | 'alert_offline'
    | 'alert_spool_low'
    | 'queue_next';

export interface KobralinkEvent {
    id: string;
    type: KobralinkEventType;
    printerId: string;
    printerName: string;
    title: string;
    body: string;
    ts: number;
    data?: Record<string, string | number | boolean | null>;
}
