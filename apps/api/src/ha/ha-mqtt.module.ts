import { Global, Module } from '@nestjs/common';
import { HaMqttService } from './ha-mqtt.service';

@Global()
@Module({
    providers: [HaMqttService],
    exports: [HaMqttService],
})
export class HaMqttModule {}
