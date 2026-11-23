import { Controller, Get, Header, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('api/v1/stats')
export class StatsController {
    constructor(private readonly stats: StatsService) {}

    @Get()
    get(@Query('printerId') printerId?: string, @Query('days') days?: string) {
        return this.stats.compute(printerId || undefined, Math.max(0, Number(days) || 0));
    }

    @Get('export.csv')
    @Header('content-type', 'text/csv; charset=utf-8')
    @Header('content-disposition', 'attachment; filename="kobralink-prints.csv"')
    exportCsv(@Query('printerId') printerId?: string, @Query('days') days?: string) {
        return this.stats.exportCsv(printerId || undefined, Math.max(0, Number(days) || 0));
    }
}
