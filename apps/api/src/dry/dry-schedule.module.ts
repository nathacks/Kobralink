import { Module } from '@nestjs/common';
import { DryScheduleController } from './dry-schedule.controller';
import { DryScheduleService } from './dry-schedule.service';

@Module({
    controllers: [DryScheduleController],
    providers: [DryScheduleService],
})
export class DryScheduleModule {}
