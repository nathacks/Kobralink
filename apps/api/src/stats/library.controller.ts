import { Controller, Get, Query } from '@nestjs/common';
import { GcodeService } from '../gcode/gcode.service';
import { StatsService } from './stats.service';

@Controller('api/v1')
export class LibraryController {
    constructor(
        private readonly gcode: GcodeService,
        private readonly stats: StatsService,
    ) {}

    @Get('files')
    files() {
        return this.gcode.list();
    }

    @Get('history')
    history(@Query('printerId') printerId?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
        return this.stats.history(printerId || undefined, Math.min(Number(limit) || 50, 200), Number(offset) || 0);
    }
}
