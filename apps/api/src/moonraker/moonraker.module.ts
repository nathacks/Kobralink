import { Module } from '@nestjs/common';
import { MoonrakerHost } from './moonraker.host';
import { MoonrakerAuthService } from './moonraker-auth.service';

@Module({
    providers: [MoonrakerHost, MoonrakerAuthService],
    exports: [MoonrakerHost, MoonrakerAuthService],
})
export class MoonrakerModule {}
