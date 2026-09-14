import { Module } from '@nestjs/common';
import { LogsController } from '../logs/logs.controller';
import { PrintersController } from '../printers/printers.controller';
import { KxController } from './kx.controller';

@Module({
    controllers: [PrintersController, KxController, LogsController],
})
export class KxModule {}
