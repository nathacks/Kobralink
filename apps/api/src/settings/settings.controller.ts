import { type UpdateAppSettingsInput, updateAppSettingsSchema } from '@kobralink/shared';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { SettingsService } from './settings.service';

@Controller('kx/settings')
export class SettingsController {
    constructor(private readonly settings: SettingsService) {}

    @Get()
    get() {
        return this.settings.get();
    }

    @Patch()
    update(@Body(new ZodPipe(updateAppSettingsSchema)) body: UpdateAppSettingsInput) {
        return this.settings.update(body);
    }
}
