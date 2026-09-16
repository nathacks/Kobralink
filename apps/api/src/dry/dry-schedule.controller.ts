import { type ScheduleDryInput, scheduleDrySchema } from '@kobralink/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { DryScheduleService } from './dry-schedule.service';

@Controller('api/v1/printers/:id/dry-schedule')
export class DryScheduleController {
    constructor(private readonly schedule: DryScheduleService) {}

    @Get()
    list(@Param('id') id: string) {
        return this.schedule.list(id);
    }

    @Post()
    create(@Param('id') id: string, @Body(new ZodPipe(scheduleDrySchema)) body: ScheduleDryInput) {
        return this.schedule.create(id, body);
    }

    @Delete(':itemId')
    @HttpCode(204)
    async remove(@Param('id') id: string, @Param('itemId') itemId: string) {
        await this.schedule.remove(id, itemId);
    }
}
