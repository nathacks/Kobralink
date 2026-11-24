import {
    type PushSubscriptionInput,
    type PushUnsubscribeInput,
    pushSubscriptionSchema,
    pushUnsubscribeSchema,
} from '@kobralink/shared';
import { Body, Controller, Get, HttpCode, Post, SetMetadata } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ALLOW_VIEWER_WRITE } from '../common/write.guard';
import { ZodPipe } from '../common/zod.pipe';
import { PushService } from './push.service';

@Controller('api/v1/push')
@SetMetadata(ALLOW_VIEWER_WRITE, true)
export class PushController {
    constructor(private readonly push: PushService) {}

    @Get('key')
    key(): { publicKey: string } {
        return { publicKey: this.push.publicKey() };
    }

    @Post('subscribe')
    @HttpCode(204)
    async subscribe(
        @Session() session: UserSession,
        @Body(new ZodPipe(pushSubscriptionSchema)) body: PushSubscriptionInput,
    ): Promise<void> {
        await this.push.subscribe(session.user.id, body);
    }

    @Post('unsubscribe')
    @HttpCode(204)
    async unsubscribe(@Body(new ZodPipe(pushUnsubscribeSchema)) body: PushUnsubscribeInput): Promise<void> {
        await this.push.unsubscribe(body.endpoint);
    }
}
