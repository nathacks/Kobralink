import type { KobralinkEvent, PrinterLiveState } from '@kobralink/shared';
import { Controller, Get, MessageEvent, Post, Sse } from '@nestjs/common';
import { filter, fromEvent, map, merge, Observable } from 'rxjs';
import type { CommandRefused } from '../bridge/printer-bridge';
import { type LogEntry, logBuffer } from '../logs/log-buffer';
import { NotificationService } from './notification.service';

@Controller('kx')
export class NotificationController {
    constructor(private readonly notifications: NotificationService) {}

    @Get('notifications')
    recent(): KobralinkEvent[] {
        return this.notifications.recent();
    }

    @Post('notifications/test')
    test() {
        return this.notifications.test();
    }

    @Sse('events')
    events(): Observable<MessageEvent> {
        const notifications = (fromEvent(this.notifications, 'notification') as Observable<KobralinkEvent>).pipe(
            map((ev): MessageEvent => ({ type: 'notification', data: ev as unknown as object })),
        );
        const states = (
            fromEvent(this.notifications, 'state', (printerId: string, state: PrinterLiveState) => ({
                printerId,
                state,
            })) as Observable<{ printerId: string; state: PrinterLiveState }>
        ).pipe(map((ev): MessageEvent => ({ type: 'state', data: ev as unknown as object })));
        const errors = (fromEvent(logBuffer, 'entry') as Observable<LogEntry>).pipe(
            filter((e) => e.level === 'error'),
            map((e): MessageEvent => ({ type: 'log', data: e as unknown as object })),
        );
        const refused = (fromEvent(this.notifications, 'refused') as Observable<CommandRefused>).pipe(
            map((r): MessageEvent => ({ type: 'refused', data: r as unknown as object })),
        );
        return merge(notifications, states, errors, refused);
    }
}
