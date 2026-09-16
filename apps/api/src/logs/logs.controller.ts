import { Controller, Get, Header, Query } from '@nestjs/common';
import { logBuffer } from './log-buffer';

@Controller('api/v1/logs')
export class LogsController {
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
