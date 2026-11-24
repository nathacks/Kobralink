import { Module } from '@nestjs/common';
import { ScheduledPrintController } from './scheduled-print.controller';
import { ScheduledPrintService } from './scheduled-print.service';

@Module({
    controllers: [ScheduledPrintController],
    providers: [ScheduledPrintService],
    exports: [ScheduledPrintService],
})
export class ScheduledPrintModule {}
