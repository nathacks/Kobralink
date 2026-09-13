import { Module } from '@nestjs/common';
import { PrintersController } from '../printers/printers.controller';
import { KxController } from './kx.controller';

@Module({
    controllers: [PrintersController, KxController],
})
export class KxModule {}
