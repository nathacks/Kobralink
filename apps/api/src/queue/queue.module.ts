import { Global, Module } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Global()
@Module({
    controllers: [QueueController],
    providers: [QueueService],
    exports: [QueueService],
})
export class QueueModule {}
