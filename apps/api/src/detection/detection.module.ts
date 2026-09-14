import { Global, Module } from '@nestjs/common';
import { DetectionController } from './detection.controller';
import { DetectionService } from './detection.service';

@Global()
@Module({
    controllers: [DetectionController],
    providers: [DetectionService],
    exports: [DetectionService],
})
export class DetectionModule {}
