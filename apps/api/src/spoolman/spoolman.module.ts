import { Global, Module } from '@nestjs/common';
import { SpoolmanController } from './spoolman.controller';
import { SpoolmanService } from './spoolman.service';

@Global()
@Module({
    controllers: [SpoolmanController],
    providers: [SpoolmanService],
    exports: [SpoolmanService],
})
export class SpoolmanModule {}
