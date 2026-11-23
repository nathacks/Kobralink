import {
    type CompleteMaintenanceInput,
    completeMaintenanceSchema,
    type MaintenanceTaskInput,
    maintenanceTaskSchema,
} from '@kobralink/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { MaintenanceService } from './maintenance.service';

@Controller('api/v1/printers/:id/maintenance')
export class MaintenanceController {
    constructor(private readonly maintenance: MaintenanceService) {}

    @Get()
    list(@Param('id') id: string) {
        return this.maintenance.list(id);
    }

    @Post()
    create(@Param('id') id: string, @Body(new ZodPipe(maintenanceTaskSchema)) body: MaintenanceTaskInput) {
        return this.maintenance.create(id, body);
    }

    @Patch(':taskId')
    update(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Body(new ZodPipe(maintenanceTaskSchema)) body: MaintenanceTaskInput,
    ) {
        return this.maintenance.update(id, taskId, body);
    }

    @Post(':taskId/done')
    complete(
        @Param('id') id: string,
        @Param('taskId') taskId: string,
        @Body(new ZodPipe(completeMaintenanceSchema)) body: CompleteMaintenanceInput,
    ) {
        return this.maintenance.complete(id, taskId, body);
    }

    @Get(':taskId/log')
    logs(@Param('id') id: string, @Param('taskId') taskId: string, @Query('limit') limit?: string) {
        return this.maintenance.logs(id, taskId, Math.min(Number(limit) || 20, 200));
    }

    @Delete(':taskId')
    @HttpCode(204)
    async remove(@Param('id') id: string, @Param('taskId') taskId: string) {
        await this.maintenance.remove(id, taskId);
    }
}
