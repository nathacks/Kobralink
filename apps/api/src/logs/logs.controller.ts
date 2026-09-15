import { Controller, Get, Header, MessageEvent, Query, Sse } from '@nestjs/common';
import { fromEvent, map, merge, Observable, of } from 'rxjs';
import { type LogEntry, logBuffer } from './log-buffer';

@Controller('kx/logs')
export class LogsController {
    @Sse('stream')
    stream(): Observable<MessageEvent> {
        const live = (fromEvent(logBuffer, 'entry') as Observable<LogEntry>).pipe(
            map((e): MessageEvent => ({ type: 'log', data: e as unknown as object })),
        );
        return merge(of<MessageEvent>({ type: 'snapshot', data: logBuffer.all() as unknown as object }), live);
    }

    @Get('download')
    @Header('content-type', 'text/plain; charset=utf-8')
    @Header('content-disposition', `attachment; filename="kobralink-log.txt"`)
    download(@Query('printerId') printerId?: string): string {
        const lines = logBuffer
            .all()
            .filter((e) => !printerId || (printerId === 'system' ? !e.printerId : e.printerId === printerId))
            .map(
                (e) =>
                    `[${new Date(e.ts).toISOString()}] ${e.level.toUpperCase().padEnd(7)} ${e.context}: ${e.message}`,
            );
        return `# Kobralink log  |  ${new Date().toISOString()}  |  ${lines.length} entries\n${lines.join('\n')}\n`;
    }
}
