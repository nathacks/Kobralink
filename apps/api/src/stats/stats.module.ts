import { Global, Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Global()
@Module({
    controllers: [StatsController, LibraryController],
    providers: [StatsService],
    exports: [StatsService],
})
export class StatsModule {}
