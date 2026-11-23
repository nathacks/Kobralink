import { Global, Module } from '@nestjs/common';
import { EnergyService } from './energy.service';
import { HaApiService } from './ha-api.service';
import { HomeAssistantController } from './home-assistant.controller';
import { PowerService } from './power.service';

@Global()
@Module({
    controllers: [HomeAssistantController],
    providers: [HaApiService, EnergyService, PowerService],
    exports: [HaApiService, EnergyService, PowerService],
})
export class HomeAssistantModule {}
