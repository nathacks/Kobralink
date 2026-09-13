import { Module } from '@nestjs/common';
import { MoonrakerHost } from './moonraker.host';

@Module({
    providers: [MoonrakerHost],
    exports: [MoonrakerHost],
})
export class MoonrakerModule {}
