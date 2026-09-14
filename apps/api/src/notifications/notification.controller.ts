import type { KobralinkEvent, PrinterLiveState } from '@kobralink/shared';
import { Controller, Get, MessageEvent, Post, Sse } from '@nestjs/common';
import { fromEvent, map, merge, Observable } from 'rxjs';
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
        return merge(notifications, states);
    }
}
