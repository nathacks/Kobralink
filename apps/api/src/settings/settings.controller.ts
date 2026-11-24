import { isAdmin, type UpdateAppSettingsInput, type UserRole, updateAppSettingsSchema } from '@kobralink/shared';
import { Body, Controller, ForbiddenException, Get, Patch } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ZodPipe } from '../common/zod.pipe';
import { m } from '../i18n/locale';
import { SettingsService } from './settings.service';

@Controller('api/v1/settings')
export class SettingsController {
    constructor(private readonly settings: SettingsService) {}

    @Get()
    get() {
        return this.settings.get();
    }

    @Patch()
    update(@Body(new ZodPipe(updateAppSettingsSchema)) body: UpdateAppSettingsInput, @Session() session: UserSession) {
        const toggled = body.mcpEnabled !== undefined && body.mcpEnabled !== this.settings.get().mcpEnabled;
        const permissions = body.mcpTools !== undefined;
        if ((toggled || permissions) && !isAdmin((session.user as { role?: UserRole }).role)) {
            throw new ForbiddenException(m.api_forbidden_role());
        }
        return this.settings.update(body);
    }
}
