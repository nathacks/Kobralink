import { z } from 'zod';

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
    | 'alert_print_failure'
    | 'queue_next'
    | 'queue_filament'
    | 'scheduled_print'
    | 'maintenance_due'
    | 'automation';

export interface KobralinkEvent {
    id: string;
    type: KobralinkEventType;
    printerId: string;
    printerName: string;
    title: string;
    body: string;
    ts: number;
    url?: string;
    data?: Record<string, string | number | boolean | null>;
}

export function eventLinkPath(type: KobralinkEventType, printerId: string): string {
    switch (type) {
        case 'queue_next':
        case 'queue_filament':
        case 'scheduled_print':
            return '/queue';
        case 'maintenance_due':
            return '/maintenance';
        case 'alert_spool_low':
            return '/filament';
        case 'automation':
            return '/automations';
        default:
            return printerId ? `/printers/${printerId}` : '/printers';
    }
}

export const pushSubscriptionSchema = z.object({
    endpoint: z.url({ protocol: /^https$/ }).max(2048),
    keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2048) });
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
