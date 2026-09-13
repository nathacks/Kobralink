import {
    type AddPrinterInput,
    addPrinterSchema,
    type UpdatePrinterInput,
    updatePrinterSchema,
} from '@kobralink/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { ZodPipe } from '../common/zod.pipe';
import { PrintersService } from './printers.service';

@Controller('kx/printers')
export class PrintersController {
    constructor(
        private readonly printers: PrintersService,
        private readonly registry: BridgeRegistry,
    ) {}

    @Get()
    async list() {
        const rows = await this.printers.findAll();
        return rows.map((r) => ({
            ...PrintersService.toDto(r),
            live: this.registry.has(r.id) ? this.registry.get(r.id).snapshot() : null,
        }));
    }

    @Post()
    async add(@Body(new ZodPipe(addPrinterSchema)) body: AddPrinterInput) {
        const row = await this.printers.add(body);
        await this.registry.spawn(PrintersService.toBridgeConfig(row));
        return PrintersService.toDto(row);
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        const row = await this.printers.findOne(id);
        return {
            ...PrintersService.toDto(row),
            live: this.registry.has(id) ? this.registry.get(id).snapshot() : null,
        };
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body(new ZodPipe(updatePrinterSchema)) body: UpdatePrinterInput) {
        const row = await this.printers.update(id, body);
        await this.registry.refresh(id);
        return PrintersService.toDto(row);
    }

    @Post(':id/refresh-credentials')
    async refreshCredentials(@Param('id') id: string) {
        const row = await this.printers.refreshCredentials(id);
        await this.registry.refresh(id);
        return PrintersService.toDto(row);
    }

    @Post(':id/reconnect')
    @HttpCode(204)
    async reconnect(@Param('id') id: string) {
        await this.registry.get(id).reconnectNow();
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string) {
        await this.registry.despawn(id);
        await this.printers.remove(id);
    }
}
