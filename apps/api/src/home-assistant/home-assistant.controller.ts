import { type HomeAssistantTestInput, homeAssistantTestSchema } from '@kobralink/shared';
import { BadGatewayException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { HaApiService } from './ha-api.service';

@Controller('api/v1/home-assistant')
export class HomeAssistantController {
    constructor(private readonly ha: HaApiService) {}

    @Post('test')
    @HttpCode(200)
    test(@Body(new ZodPipe(homeAssistantTestSchema)) body: HomeAssistantTestInput) {
        return this.ha.test(body);
    }

    @Get('switches')
    async switches() {
        try {
            return await this.ha.switches();
        } catch (e) {
            throw new BadGatewayException((e as Error).message);
        }
    }

    @Get('energy-sensors')
    async energySensors() {
        try {
            return await this.ha.energySensors();
        } catch (e) {
            throw new BadGatewayException((e as Error).message);
        }
    }
}
