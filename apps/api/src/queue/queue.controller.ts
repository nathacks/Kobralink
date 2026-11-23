import {
    type AddQueueItemInput,
    addQueueItemSchema,
    type BedClearInput,
    bedClearSchema,
    type MaintenanceModeInput,
    maintenanceModeSchema,
    type QueueCheckInput,
    queueCheckSchema,
    type ReorderQueueInput,
    reorderQueueSchema,
} from '@kobralink/shared';
import { BadGatewayException, Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { QueueService } from './queue.service';

@Controller('api/v1')
export class QueueController {
    constructor(private readonly queue: QueueService) {}

    @Get('queue')
    list() {
        return this.queue.list();
    }

    @Post('queue')
    add(@Body(new ZodPipe(addQueueItemSchema)) body: AddQueueItemInput) {
        const { fileId, excludedObjects, printerId, targetTags, ...options } = body;
        return this.queue.add(fileId, excludedObjects ?? [], false, options, {
            printerId: printerId ?? null,
            targetTags: printerId ? [] : (targetTags ?? []),
        });
    }

    @Post('queue/check')
    check(@Body(new ZodPipe(queueCheckSchema)) body: QueueCheckInput) {
        return this.queue.check(body.fileId, {
            printerId: body.printerId ?? null,
            targetTags: body.printerId ? [] : (body.targetTags ?? []),
        });
    }

    @Post('queue/reorder')
    reorder(@Body(new ZodPipe(reorderQueueSchema)) body: ReorderQueueInput) {
        return this.queue.reorder(body.ids);
    }

    @Delete('queue')
    @HttpCode(204)
    async clearAll() {
        await this.queue.clear();
    }

    @Delete('queue/:itemId')
    @HttpCode(204)
    async removeItem(@Param('itemId') itemId: string) {
        await this.queue.remove(itemId);
    }

    @Get('printers/:id/queue')
    listFor(@Param('id') id: string) {
        return this.queue.listFor(id);
    }

    @Get('printers/:id/queue/status')
    status(@Param('id') id: string) {
        return this.queue.status(id);
    }

    @Post('printers/:id/queue')
    addFor(@Param('id') id: string, @Body(new ZodPipe(addQueueItemSchema)) body: AddQueueItemInput) {
        const { fileId, excludedObjects, printerId: _ignored, targetTags: _tags, ...options } = body;
        return this.queue.add(fileId, excludedObjects ?? [], false, options, { printerId: id, targetTags: [] });
    }

    @Post('printers/:id/queue/start')
    async start(@Param('id') id: string) {
        try {
            return await this.queue.startNext(id);
        } catch (e) {
            throw new BadGatewayException((e as Error).message);
        }
    }

    @Post('printers/:id/queue/bed-clear')
    async bedClear(@Param('id') id: string, @Body(new ZodPipe(bedClearSchema)) body: BedClearInput) {
        try {
            return await this.queue.confirmBedClear(id, body.outcome ?? 'good');
        } catch (e) {
            throw new BadGatewayException((e as Error).message);
        }
    }

    @Delete('printers/:id/queue/auto-start')
    cancelAutoStart(@Param('id') id: string) {
        this.queue.cancelAutoStart(id);
        return this.queue.status(id);
    }

    @Post('printers/:id/queue/maintenance')
    maintenance(@Param('id') id: string, @Body(new ZodPipe(maintenanceModeSchema)) body: MaintenanceModeInput) {
        return this.queue.setMaintenance(id, body.enabled);
    }

    @Delete('printers/:id/queue')
    @HttpCode(204)
    async clear(@Param('id') id: string) {
        await this.queue.clear(id);
    }

    @Delete('printers/:id/queue/:itemId')
    @HttpCode(204)
    async remove(@Param('itemId') itemId: string) {
        await this.queue.remove(itemId);
    }
}
