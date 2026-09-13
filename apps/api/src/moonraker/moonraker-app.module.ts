import { DynamicModule, Module } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { FilamentService } from '../filament/filament.service';
import { GcodeService } from '../gcode/gcode.service';
import { MoonrakerController } from './moonraker.controller';
import { MoonrakerGateway } from './moonraker.gateway';
import { MoonrakerService, PRINTER_BRIDGE } from './moonraker.service';

@Module({})
export class MoonrakerAppModule {
    static forPrinter(bridge: PrinterBridge, gcode: GcodeService, filaments: FilamentService): DynamicModule {
        return {
            module: MoonrakerAppModule,
            controllers: [MoonrakerController],
            providers: [
                { provide: PRINTER_BRIDGE, useValue: bridge },
                { provide: GcodeService, useValue: gcode },
                { provide: FilamentService, useValue: filaments },
                MoonrakerService,
                MoonrakerGateway,
            ],
        };
    }
}
