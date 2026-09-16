import {
    type KobralinkEvent,
    type PrinterLiveState,
    parseSseChannelKey,
    type SseChannel,
    type SseEnvelope,
} from '@kobralink/shared';
import { BadRequestException, Controller, MessageEvent, Query, Sse } from '@nestjs/common';
import { EMPTY, filter, fromEvent, interval, map, merge, Observable, of } from 'rxjs';
import type { CommandRefused } from '../bridge/printer-bridge';
import { type LogEntry, logBuffer } from '../logs/log-buffer';
import { NotificationService } from '../notifications/notification.service';

const HEARTBEAT_MS = 25_000;
const MAX_CHANNELS = 32;

type Frame = Pick<SseEnvelope, 'event' | 'data'>;

@Controller('api/v1/events')
export class SseMuxController {
    constructor(private readonly notifications: NotificationService) {}

    @Sse('multiplexed')
    multiplexed(@Query('channels') channels = ''): Observable<MessageEvent> {
        const keys = [
            ...new Set(
                channels
                    .split(',')
                    .map((k) => decodeURIComponent(k.trim()))
                    .filter(Boolean),
            ),
        ];
        if (keys.length > MAX_CHANNELS) throw new BadRequestException(`too many channels (max ${MAX_CHANNELS})`);

        const streams = keys.map((key) => {
            const parsed = parseSseChannelKey(key);
            if (!parsed) throw new BadRequestException(`unknown channel: ${key}`);
            const params = Object.keys(parsed.params).length ? parsed.params : undefined;
            return this.channel(parsed.channel).pipe(
                map((f): SseEnvelope => ({ channel: parsed.channel, params, ...f })),
            );
        });

        const heartbeat = interval(HEARTBEAT_MS).pipe(
            map((): SseEnvelope => ({ channel: '*', event: 'heartbeat', data: Date.now() })),
        );

        return merge(...streams, heartbeat).pipe(map((env): MessageEvent => ({ data: env as unknown as object })));
    }

    private channel(channel: SseChannel): Observable<Frame> {
        switch (channel) {
            case 'printers':
                return this.printers();
            case 'logs':
                return this.logs();
            default:
                return EMPTY;
        }
    }

    private printers(): Observable<Frame> {
        const notifications = (fromEvent(this.notifications, 'notification') as Observable<KobralinkEvent>).pipe(
            map((ev): Frame => ({ event: 'notification', data: ev })),
        );
        const states = (
            fromEvent(this.notifications, 'state', (printerId: string, state: PrinterLiveState) => ({
                printerId,
                state,
            })) as Observable<{ printerId: string; state: PrinterLiveState }>
        ).pipe(map((ev): Frame => ({ event: 'state', data: ev })));
        const errors = (fromEvent(logBuffer, 'entry') as Observable<LogEntry>).pipe(
            filter((e) => e.level === 'error'),
            map((e): Frame => ({ event: 'log', data: e })),
        );
        const refused = (fromEvent(this.notifications, 'refused') as Observable<CommandRefused>).pipe(
            map((r): Frame => ({ event: 'refused', data: r })),
        );
        return merge(notifications, states, errors, refused);
    }

    private logs(): Observable<Frame> {
        const live = (fromEvent(logBuffer, 'entry') as Observable<LogEntry>).pipe(
            map((e): Frame => ({ event: 'log', data: e })),
        );
        return merge(of<Frame>({ event: 'snapshot', data: logBuffer.all() }), live);
    }
}
