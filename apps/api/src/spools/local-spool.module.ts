import { Global, Module } from '@nestjs/common';
import { LocalSpoolController } from './local-spool.controller';
import { LocalSpoolService } from './local-spool.service';

@Global()
@Module({
    controllers: [LocalSpoolController],
    providers: [LocalSpoolService],
    exports: [LocalSpoolService],
})
export class LocalSpoolModule {}
