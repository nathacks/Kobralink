import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service';

@Controller('kx/setup')
export class SetupController {
    constructor(private readonly prisma: PrismaService) {}

    @Get('status')
    @AllowAnonymous()
    async status() {
        const users = await this.prisma.client.user.count();
        return { needsSetup: users === 0 };
    }
}
