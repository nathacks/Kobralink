import { Global, Module } from '@nestjs/common';
import { GcodeService } from './gcode.service';

@Global()
@Module({
    providers: [GcodeService],
    exports: [GcodeService],
})
export class GcodeModule {}
