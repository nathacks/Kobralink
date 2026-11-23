import {
    type AutomationRuleInput,
    automationEnabledSchema,
    automationRuleSchema,
    automationRunSchema,
} from '@kobralink/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import type { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AutomationService } from './automation.service';

@Controller('api/v1/automations')
export class AutomationController {
    constructor(private readonly automations: AutomationService) {}

    @Get()
    list() {
        return this.automations.list();
    }

    @Post()
    create(@Body(new ZodPipe(automationRuleSchema)) body: AutomationRuleInput) {
        return this.automations.create(body);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body(new ZodPipe(automationRuleSchema)) body: AutomationRuleInput) {
        return this.automations.update(id, body);
    }

    @Patch(':id')
    setEnabled(
        @Param('id') id: string,
        @Body(new ZodPipe(automationEnabledSchema)) body: z.infer<typeof automationEnabledSchema>,
    ) {
        return this.automations.setEnabled(id, body.enabled);
    }

    @Post(':id/run')
    run(@Param('id') id: string, @Body(new ZodPipe(automationRunSchema)) body: z.infer<typeof automationRunSchema>) {
        return this.automations.runNow(id, body.printerId);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string) {
        await this.automations.remove(id);
    }
}
