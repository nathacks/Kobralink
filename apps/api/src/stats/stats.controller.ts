import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('kx/stats')
export class StatsController {
    constructor(private readonly stats: StatsService) {}

    @Get()
    get(@Query('printerId') printerId?: string, @Query('days') days?: string) {
        return this.stats.compute(printerId || undefined, Math.max(0, Number(days) || 0));
    }
}
