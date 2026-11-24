import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
    eventLinkPath,
    type KobralinkEvent,
    type KobralinkEventType,
    type NotificationSettings,
    type PrinterLiveState,
} from '@kobralink/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { BridgeDomainEvent, CommandRefused, PrinterBridge } from '../bridge/printer-bridge';
import { m, printerErrorText, runWithLocale } from '../i18n/locale';
import { maintenanceTaskName } from '../maintenance/preset-names';
import { SettingsService } from '../settings/settings.service';
import { PushService } from './push.service';

const HISTORY_MAX = 200;

type EventData = NonNullable<BridgeDomainEvent['data']>;

const EVENT_FLAG: Record<KobralinkEventType, keyof NotificationSettings['events']> = {
    print_started: 'printStarted',
    print_finished: 'printFinished',
    print_cancelled: 'printCancelled',
    print_paused: 'printPaused',
    printer_offline: 'printerOffline',
    printer_online: 'printerOnline',
    drying_done: 'dryingDone',
    alert_nozzle_temp: 'alerts',
    alert_bed_temp: 'alerts',
    alert_offline: 'alerts',
    alert_spool_low: 'alerts',
    alert_print_failure: 'printFailure',
    queue_next: 'queueNext',
    queue_filament: 'queueNext',
    scheduled_print: 'scheduledPrint',
    maintenance_due: 'maintenanceDue',
    automation: 'automation',
};

@Injectable()
export class NotificationService extends EventEmitter<{
    notification: [KobralinkEvent];
    state: [printerId: string, state: PrinterLiveState];
    refused: [refused: CommandRefused];
}> {
    private readonly log = new Logger(NotificationService.name);
    private readonly history: KobralinkEvent[] = [];
    private readonly detached = new Map<string, () => void>();

    constructor(
        private readonly settings: SettingsService,
        private readonly webPush: PushService,
    ) {
        super();
        this.setMaxListeners(200);
    }

    attach(bridge: PrinterBridge): void {
        const onEvent = (ev: BridgeDomainEvent) => this.dispatch(bridge, ev);
        let timer: NodeJS.Timeout | null = null;
        let pending: PrinterLiveState | null = null;
        const onState = (state: PrinterLiveState) => {
            pending = state;
            if (timer) return;
            timer = setTimeout(() => {
                timer = null;
                if (pending) this.emit('state', bridge.id, pending);
                pending = null;
            }, 500);
        };
        const onRefused = (r: CommandRefused) => this.emit('refused', r);
        bridge.on('event', onEvent);
        bridge.on('state', onState);
        bridge.on('refused', onRefused);
        this.detached.set(bridge.id, () => {
            bridge.off('event', onEvent);
            bridge.off('state', onState);
            bridge.off('refused', onRefused);
            if (timer) clearTimeout(timer);
        });
    }

    detach(printerId: string): void {
        this.detached.get(printerId)?.();
        this.detached.delete(printerId);
    }

    recent(): KobralinkEvent[] {
        return [...this.history];
    }

    private dispatch(bridge: PrinterBridge, ev: BridgeDomainEvent): void {
        const event = this.build(bridge.id, bridge.config.name, ev.type, ev.data ?? {});
        this.push(event);
    }

    push(event: KobralinkEvent): void {
        this.history.push(event);
        if (this.history.length > HISTORY_MAX) this.history.splice(0, this.history.length - HISTORY_MAX);
        this.emit('notification', event);
        const cfg = this.settings.get().notifications;
        if (!cfg.events[EVENT_FLAG[event.type]]) return;
        void this.deliver(event, cfg);
    }

    emitCustom(printerId: string, printerName: string, type: KobralinkEventType, data: EventData = {}): void {
        this.push(this.build(printerId, printerName, type, data));
    }

    build(printerId: string, printerName: string, type: KobralinkEventType, data: EventData): KobralinkEvent {
        const { locale, publicUrl } = this.settings.get();
        const { title, body } = runWithLocale(locale, () => describe(type, printerName, data));
        const url = eventUrl(publicUrl, type, printerId);
        return {
            id: randomUUID(),
            type,
            printerId,
            printerName,
            title,
            body,
            ts: Date.now(),
            data,
            ...(url ? { url } : {}),
        };
    }

    async test(): Promise<{ delivered: string[]; failed: { channel: string; error: string }[] }> {
        const cfg = this.settings.get().notifications;
        const locale = this.settings.get().locale;
        const event: KobralinkEvent = {
            id: randomUUID(),
            type: 'print_finished',
            printerId: '',
            printerName: 'Kobralink',
            title: runWithLocale(locale, () => m.notify_test_title()),
            body: runWithLocale(locale, () => m.notify_test_body()),
            ts: Date.now(),
        };
        return this.deliver(event, cfg, true);
    }

    private async deliver(
        event: KobralinkEvent,
        cfg: NotificationSettings,
        collect = false,
    ): Promise<{ delivered: string[]; failed: { channel: string; error: string }[] }> {
        const delivered: string[] = [];
        const failed: { channel: string; error: string }[] = [];
        const tasks: [string, Promise<void>][] = [];
        if (cfg.webhookUrl) tasks.push(['webhook', this.sendWebhook(cfg.webhookUrl, event)]);
        if (cfg.discordUrl) tasks.push(['discord', this.sendDiscord(cfg.discordUrl, event)]);
        if (cfg.telegramToken && cfg.telegramChatId) {
            tasks.push(['telegram', this.sendTelegram(cfg.telegramToken, cfg.telegramChatId, event)]);
        }
        if (cfg.ntfyUrl) tasks.push(['ntfy', this.sendNtfy(cfg.ntfyUrl, event)]);
        if (await this.webPush.hasSubscribers()) tasks.push(['push', this.webPush.send(event)]);
        await Promise.all(
            tasks.map(([channel, p]) =>
                p.then(
                    () => delivered.push(channel),
                    (e: Error) => {
                        failed.push({ channel, error: e.message });
                        if (!collect) this.log.warn(`Notification ${channel} failed: ${e.message}`);
                    },
                ),
            ),
        );
        return { delivered, failed };
    }

    private async post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
            const isText = typeof body === 'string';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json', ...headers },
                body: isText ? body : JSON.stringify(body),
                signal: ctrl.signal,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } finally {
            clearTimeout(timer);
        }
    }

    private sendWebhook(url: string, event: KobralinkEvent): Promise<void> {
        return this.post(url, event);
    }

    private sendDiscord(url: string, event: KobralinkEvent): Promise<void> {
        const color = event.type.startsWith('alert') ? 0xef4444 : event.type === 'print_finished' ? 0x10b981 : 0x3b82f6;
        return this.post(url, {
            username: 'Kobralink',
            embeds: [
                {
                    title: event.title,
                    description: event.url ? `${event.body}\n\n[${this.openLabel()}](${event.url})` : event.body,
                    ...(event.url ? { url: event.url } : {}),
                    color,
                    footer: { text: event.printerName },
                    timestamp: new Date(event.ts).toISOString(),
                },
            ],
        });
    }

    private sendTelegram(token: string, chatId: string, event: KobralinkEvent): Promise<void> {
        return this.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: `*${escapeMd(event.title)}*\n${escapeMd(event.body)}${event.url ? `\n[${escapeMd(this.openLabel())}](${escapeUrl(event.url)})` : ''}`,
            parse_mode: 'MarkdownV2',
        });
    }

    private openLabel(): string {
        return runWithLocale(this.settings.get().locale, () => m.notify_open_link());
    }

    private sendNtfy(url: string, event: KobralinkEvent): Promise<void> {
        const tags = event.type.startsWith('alert')
            ? 'rotating_light'
            : event.type === 'print_finished'
              ? 'white_check_mark'
              : 'printer';
        return this.post(url, event.body, {
            Title: headerValue(event.title),
            Tags: tags,
            Priority: event.type.startsWith('alert') ? '4' : '3',
            ...(event.url ? { Click: event.url, Actions: headerValue(`view, ${this.openLabel()}, ${event.url}`) } : {}),
        });
    }
}

function escapeMd(s: string): string {
    return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

export function headerValue(s: string): string {
    return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function escapeUrl(s: string): string {
    return s.replace(/[)\\]/g, (c) => `\\${c}`);
}

function describe(type: KobralinkEventType, printer: string, d: EventData): { title: string; body: string } {
    const filename = String(d.filename ?? '');
    switch (type) {
        case 'print_started':
            return { title: m.notify_print_started_title({ printer }), body: filename };
        case 'print_finished':
            return {
                title: m.notify_print_finished_title({ printer }),
                body: m.notify_print_finished_body({ filename, duration: fmtDuration(Number(d.durationSec ?? 0)) }),
            };
        case 'print_cancelled':
            return { title: m.notify_print_cancelled_title({ printer }), body: filename };
        case 'print_paused':
            return {
                title: m.notify_print_paused_title({ printer }),
                body: m.notify_print_paused_body({
                    code: String(d.code ?? ''),
                    msg: printerErrorText(Number(d.code), String(d.msg ?? '')),
                }),
            };
        case 'printer_offline':
            return { title: m.notify_printer_offline_title({ printer }), body: m.notify_printer_offline_body() };
        case 'printer_online':
            return { title: m.notify_printer_online_title({ printer }), body: m.notify_printer_online_body() };
        case 'drying_done':
            return { title: m.notify_drying_done_title({ printer }), body: m.notify_drying_done_body() };
        case 'alert_nozzle_temp':
            return {
                title: m.notify_alert_temp_title({ printer }),
                body: m.notify_alert_nozzle_body({ temp: String(d.temp ?? ''), max: String(d.max ?? '') }),
            };
        case 'alert_bed_temp':
            return {
                title: m.notify_alert_temp_title({ printer }),
                body: m.notify_alert_bed_body({ temp: String(d.temp ?? ''), max: String(d.max ?? '') }),
            };
        case 'alert_offline':
            return {
                title: m.notify_alert_offline_title({ printer }),
                body: m.notify_alert_offline_body({ minutes: String(d.minutes ?? '') }),
            };
        case 'alert_spool_low':
            return {
                title: m.notify_alert_spool_title({ printer }),
                body: m.notify_alert_spool_body({ spool: String(d.spool ?? ''), grams: String(d.grams ?? '') }),
            };
        case 'queue_next':
            return {
                title: m.notify_queue_next_title({ printer }),
                body: d.bedClear
                    ? m.notify_queue_next_body_bed_clear({ filename })
                    : m.notify_queue_next_body({ filename }),
            };
        case 'queue_filament':
            return { title: m.notify_queue_next_title({ printer }), body: m.notify_queue_filament_body({ filename }) };
        case 'scheduled_print': {
            const result = String(d.result ?? 'started');
            const body =
                result === 'queued'
                    ? m.notify_scheduled_print_queued({ filename })
                    : result === 'failed'
                      ? m.notify_scheduled_print_failed({ filename, error: String(d.error ?? '') })
                      : m.notify_scheduled_print_started({ filename });
            return { title: m.notify_scheduled_print_title({ printer }), body };
        }
        case 'maintenance_due':
            return {
                title: m.notify_maintenance_due_title({ printer }),
                body: m.notify_maintenance_due_body({
                    task: maintenanceTaskName({ name: String(d.task ?? ''), presetKey: String(d.presetKey ?? '') }),
                    hours: String(d.hours ?? 0),
                    jobs: String(d.jobs ?? 0),
                }),
            };
        case 'alert_print_failure': {
            const action = String(d.action ?? 'notify');
            const body =
                action === 'pause'
                    ? m.notify_alert_failure_body_pause({ score: String(d.score ?? ''), filename })
                    : action === 'cancel'
                      ? m.notify_alert_failure_body_cancel({ score: String(d.score ?? ''), filename })
                      : m.notify_alert_failure_body({ score: String(d.score ?? ''), filename });
            return { title: m.notify_alert_failure_title({ printer }), body };
        }
        case 'automation':
            return {
                title: m.notify_automation_title({ printer, rule: String(d.rule ?? '') }),
                body: String(d.message ?? ''),
            };
    }
}

export function eventUrl(publicUrl: string, type: KobralinkEventType, printerId: string): string | undefined {
    if (!publicUrl) return undefined;
    return `${publicUrl.replace(/\/+$/, '')}${eventLinkPath(type, printerId)}`;
}

function fmtDuration(sec: number): string {
    const h = Math.floor(sec / 3600);
    const min = Math.floor((sec % 3600) / 60);
    if (h) return `${h} h ${min.toString().padStart(2, '0')} min`;
    if (min) return `${min} min`;
    return `${Math.round(sec)} s`;
}
