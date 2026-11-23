import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
    controllers: [AutomationController],
    providers: [AutomationService],
})
export class AutomationModule {}
