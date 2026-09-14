import {
    type AddQueueItemInput,
    addQueueItemSchema,
    type ReorderQueueInput,
    reorderQueueSchema,
} from '@kobralink/shared';
import { BadGatewayException, Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { QueueService } from './queue.service';

@Controller('kx/printers/:id/queue')
export class QueueController {
    constructor(private readonly queue: QueueService) {}

    @Get()
    list(@Param('id') id: string) {
        return this.queue.list(id);
    }

    @Post()
    add(@Param('id') id: string, @Body(new ZodPipe(addQueueItemSchema)) body: AddQueueItemInput) {
        return this.queue.add(id, body.fileId, body.excludedObjects ?? []);
    }

    @Post('reorder')
    reorder(@Param('id') id: string, @Body(new ZodPipe(reorderQueueSchema)) body: ReorderQueueInput) {
        return this.queue.reorder(id, body.ids);
    }

    @Post('start')
    async start(@Param('id') id: string) {
        try {
            return await this.queue.startNext(id);
        } catch (e) {
            throw new BadGatewayException((e as Error).message);
        }
    }

    @Delete()
    @HttpCode(204)
    async clear(@Param('id') id: string) {
        await this.queue.clear(id);
    }

    @Delete(':itemId')
    @HttpCode(204)
    async remove(@Param('id') id: string, @Param('itemId') itemId: string) {
        await this.queue.remove(id, itemId);
    }
}
