import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { FilamentService } from '../filament/filament.service';
import { GcodeService } from '../gcode/gcode.service';
import { MacroService } from '../macros/macro.service';
import { QueueService } from '../queue/queue.service';
import { MoonrakerController } from './moonraker.controller';
import { MoonrakerGateway } from './moonraker.gateway';
import { MoonrakerService, PRINTER_BRIDGE } from './moonraker.service';
import { MoonrakerAuthGuard } from './moonraker-auth.guard';
import { MoonrakerAuthService } from './moonraker-auth.service';
import { MoonrakerFallbackController } from './moonraker-fallback.controller';

@Module({})
export class MoonrakerAppModule {
    static forPrinter(
        bridge: PrinterBridge,
        gcode: GcodeService,
        filaments: FilamentService,
        queue: QueueService,
        macros: MacroService,
        authz: MoonrakerAuthService,
    ): DynamicModule {
        return {
            module: MoonrakerAppModule,
            controllers: [MoonrakerController, MoonrakerFallbackController],
            providers: [
                { provide: PRINTER_BRIDGE, useValue: bridge },
                { provide: GcodeService, useValue: gcode },
                { provide: FilamentService, useValue: filaments },
                { provide: QueueService, useValue: queue },
                { provide: MacroService, useValue: macros },
                { provide: MoonrakerAuthService, useValue: authz },
                { provide: APP_GUARD, useClass: MoonrakerAuthGuard },
                MoonrakerService,
                MoonrakerGateway,
            ],
        };
    }
}
