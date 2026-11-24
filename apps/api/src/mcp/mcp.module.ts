import { Module } from '@nestjs/common';
import { AutomationModule } from '../automations/automation.module';
import { DryScheduleModule } from '../dry/dry-schedule.module';
import { ScheduledPrintModule } from '../schedule/scheduled-print.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpAuthService } from './mcp-auth.service';
import { McpControlTools } from './mcp-control.tools';
import { McpQuestionService } from './mcp-question.service';
import { McpReadTools } from './mcp-read.tools';

@Module({
    imports: [AutomationModule, DryScheduleModule, ScheduledPrintModule],
    controllers: [McpController],
    providers: [McpService, McpAuthService, McpQuestionService, McpReadTools, McpControlTools],
})
export class McpModule {}
