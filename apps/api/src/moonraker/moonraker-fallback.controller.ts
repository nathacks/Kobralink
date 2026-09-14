import { All, Controller, Get, Logger, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MoonrakerService } from './moonraker.service';

@Controller()
export class MoonrakerFallbackController {
    private readonly log = new Logger(MoonrakerFallbackController.name);

    constructor(private readonly moon: MoonrakerService) {}

    @Get('server/temperature_store')
    temperatureStore() {
        const s = this.moon.bridge.snapshot();
        return {
            result: {
                extruder: { temperatures: [s.nozzleTemp], targets: [s.nozzleTarget], powers: [0] },
                heater_bed: { temperatures: [s.bedTemp], targets: [s.bedTarget], powers: [0] },
            },
        };
    }

    @Get('server/config')
    config() {
        return {
            result: {
                config: { server: { host: '0.0.0.0', port: this.moon.bridge.config.httpPort } },
                orig: {},
                files: [],
            },
        };
    }

    @Get('server/gcode_store')
    gcodeStore() {
        return { result: { gcode_store: [] } };
    }

    @All('*path')
    fallback(@Req() req: Request) {
        this.log.warn(`Route Moonraker inconnue: ${req.method} ${req.originalUrl}`);
        return { result: {} };
    }
}
