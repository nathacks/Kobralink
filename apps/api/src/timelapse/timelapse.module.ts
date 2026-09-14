import { Global, Module } from '@nestjs/common';
import { TimelapseController } from './timelapse.controller';
import { TimelapseService } from './timelapse.service';

@Global()
@Module({
    controllers: [TimelapseController],
    providers: [TimelapseService],
    exports: [TimelapseService],
})
export class TimelapseModule {}
