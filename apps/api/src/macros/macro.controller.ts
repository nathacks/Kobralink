import { type MacroInput, macroSchema, reorderMacrosSchema } from '@kobralink/shared';
import {
    BadGatewayException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { z } from 'zod';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { BridgeOfflineError } from '../bridge/printer-bridge';
import { ZodPipe } from '../common/zod.pipe';
import { MacroService } from './macro.service';

@Controller('kx')
export class MacroController {
    constructor(
        private readonly macros: MacroService,
        private readonly registry: BridgeRegistry,
    ) {}

    @Get('macros')
    list() {
        return this.macros.list();
    }

    @Post('macros')
    create(@Body(new ZodPipe(macroSchema)) body: MacroInput) {
        return this.macros.create(body);
    }

    @Put('macros/:id')
    update(@Param('id') id: string, @Body(new ZodPipe(macroSchema)) body: MacroInput) {
        return this.macros.update(id, body);
    }

    @Post('macros/reorder')
    reorder(@Body(new ZodPipe(reorderMacrosSchema)) body: z.infer<typeof reorderMacrosSchema>) {
        return this.macros.reorder(body.ids);
    }

    @Delete('macros/:id')
    @HttpCode(204)
    async remove(@Param('id') id: string) {
        await this.macros.remove(id);
    }

    @Post('printers/:id/macros/:macroId/run')
    @HttpCode(204)
    async run(@Param('id') id: string, @Param('macroId') macroId: string) {
        const macro = await this.macros.get(macroId);
        try {
            await this.macros.run(this.registry.get(id), macro);
        } catch (e) {
            if (e instanceof BridgeOfflineError) throw new ServiceUnavailableException(e.message);
            if (e instanceof Error && !('status' in e)) throw new BadGatewayException(e.message);
            throw e;
        }
    }
}
