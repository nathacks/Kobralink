import { Global, Module } from '@nestjs/common';
import { MoonrakerModule } from '../moonraker/moonraker.module';
import { PrintersService } from '../printers/printers.service';
import { BridgeRegistry } from './bridge.registry';

@Global()
@Module({
    imports: [MoonrakerModule],
    providers: [BridgeRegistry, PrintersService],
    exports: [BridgeRegistry, PrintersService],
})
export class BridgeModule {}
