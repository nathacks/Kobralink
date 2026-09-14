import { type SetSpoolMapInput, setSpoolMapSchema } from '@kobralink/shared';
import { Body, Controller, Get, Param, Post, ServiceUnavailableException } from '@nestjs/common';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { ZodPipe } from '../common/zod.pipe';
import { m } from '../i18n/locale';
import { SpoolmanService } from './spoolman.service';

@Controller('kx')
export class SpoolmanController {
    constructor(
        private readonly spoolman: SpoolmanService,
        private readonly registry: BridgeRegistry,
    ) {}

    @Get('spoolman/spools')
    async spools() {
        if (!this.spoolman.configured) throw new ServiceUnavailableException(m.api_spoolman_not_configured());
        try {
            return await this.spoolman.listSpools();
        } catch (e) {
            throw new ServiceUnavailableException(m.api_spoolman_unreachable({ msg: (e as Error).message }));
        }
    }

    @Get('spoolman/health')
    async health() {
        return { reachable: await this.spoolman.checkHealth(true), configured: this.spoolman.configured };
    }

    @Get('printers/:id/spoolman')
    async status(@Param('id') id: string) {
        this.registry.get(id);
        await this.spoolman.checkHealth();
        return this.spoolman.status(id);
    }

    @Post('printers/:id/spoolman/slots')
    async setSlots(@Param('id') id: string, @Body(new ZodPipe(setSpoolMapSchema)) body: SetSpoolMapInput) {
        this.registry.get(id).resetSpoolUsage();
        return { slotSpools: await this.spoolman.setSlotMap(id, body.slotMap) };
    }
}
