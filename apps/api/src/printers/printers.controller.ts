import {
    type AddPrinterInput,
    addPrinterSchema,
    type PowerActionInput,
    type PowerState,
    powerActionSchema,
    type UpdatePrinterInput,
    updatePrinterSchema,
} from '@kobralink/shared';
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    ServiceUnavailableException,
} from '@nestjs/common';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { ZodPipe } from '../common/zod.pipe';
import { PowerService } from '../home-assistant/power.service';
import { m } from '../i18n/locale';
import { PrintersService } from './printers.service';

@Controller('api/v1/printers')
export class PrintersController {
    constructor(
        private readonly printers: PrintersService,
        private readonly registry: BridgeRegistry,
        private readonly powerService: PowerService,
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

    @Post(':id/connect')
    @HttpCode(204)
    connect(@Param('id') id: string) {
        this.registry.get(id).connectManual();
    }

    @Post(':id/disconnect')
    @HttpCode(204)
    async disconnect(@Param('id') id: string) {
        await this.registry.get(id).disconnectManual();
    }

    @Post(':id/power')
    async power(@Param('id') id: string, @Body(new ZodPipe(powerActionSchema)) body: PowerActionInput) {
        const settings = this.registry.get(id).settings;
        if (!this.powerService.configured(settings)) throw new BadRequestException(m.api_no_plug());
        try {
            await this.powerService.set(settings, body.action);
        } catch (e) {
            throw new ServiceUnavailableException((e as Error).message);
        }
        return { state: body.action };
    }

    @Get(':id/power')
    async powerStatus(@Param('id') id: string): Promise<{ state: PowerState; configured: boolean }> {
        const settings = this.registry.get(id).settings;
        const configured = this.powerService.configured(settings);
        if (!configured) return { state: 'unknown', configured };
        try {
            return { state: await this.powerService.state(settings), configured };
        } catch (e) {
            throw new ServiceUnavailableException((e as Error).message);
        }
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
