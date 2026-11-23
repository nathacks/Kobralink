import { type SchedulePrintInput, schedulePrintSchema } from '@kobralink/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { ScheduledPrintService } from './scheduled-print.service';

@Controller('api/v1/printers/:id/schedule')
export class ScheduledPrintController {
    constructor(private readonly schedule: ScheduledPrintService) {}

    @Get()
    list(@Param('id') id: string) {
        return this.schedule.list(id);
    }

    @Post()
    create(@Param('id') id: string, @Body(new ZodPipe(schedulePrintSchema)) body: SchedulePrintInput) {
        return this.schedule.create(id, body);
    }

    @Delete(':itemId')
    @HttpCode(204)
    async remove(@Param('id') id: string, @Param('itemId') itemId: string) {
        await this.schedule.remove(id, itemId);
    }
}
