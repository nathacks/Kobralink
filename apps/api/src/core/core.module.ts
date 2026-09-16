import { Module } from '@nestjs/common';
import { SseMuxController } from '../events/sse-mux.controller';
import { LogsController } from '../logs/logs.controller';
import { PrintersController } from '../printers/printers.controller';
import { CoreController } from './core.controller';

@Module({
    controllers: [PrintersController, CoreController, LogsController, SseMuxController],
})
export class CoreModule {}
