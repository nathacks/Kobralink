import { type SetSlotProfileInput, setSlotProfileSchema } from '@kobralink/shared';
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { ZodPipe } from '../common/zod.pipe';
import { m } from '../i18n/locale';
import { FilamentService } from './filament.service';

type MulterFile = { originalname: string; buffer: Buffer; size: number };

@Controller('api/v1')
export class FilamentController {
    constructor(
        private readonly filaments: FilamentService,
        private readonly registry: BridgeRegistry,
    ) {}

    @Get('filament/profiles')
    profiles(@Query('type') type?: string, @Query('vendor') vendor?: string) {
        return this.filaments.profiles({ type, vendor });
    }

    @Get('filament/vendors')
    vendors() {
        return this.filaments.vendors();
    }

    @Get('filament/profiles/user')
    userProfiles() {
        return this.filaments.userProfiles();
    }

    @Post('filament/profiles/user')
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 50 * 1024 * 1024, files: 200 } }))
    async importProfiles(@UploadedFiles() files: MulterFile[] | undefined) {
        if (!files?.length) throw new BadRequestException(m.api_no_profile_files());
        try {
            return await this.filaments.importProfiles(files);
        } catch (e) {
            throw new BadRequestException((e as Error).message);
        }
    }

    @Delete('filament/profiles/user')
    deleteUserProfiles(@Query('vendor') vendor?: string, @Query('name') name?: string) {
        return this.filaments.deleteUserProfiles(vendor, name);
    }

    @Get('printers/:id/filament/slots')
    slots(@Param('id') id: string) {
        const bridge = this.registry.get(id);
        return this.filaments.slotInfos(id, bridge.snapshot().amsSlots);
    }

    @Post('printers/:id/filament/slots/:idx/profile')
    async setSlotProfile(
        @Param('id') id: string,
        @Param('idx', ParseIntPipe) idx: number,
        @Body(new ZodPipe(setSlotProfileSchema)) body: SetSlotProfileInput,
    ) {
        this.registry.get(id);
        const ref = await this.filaments.setSlotProfile(id, idx, body.vendor ?? '', body.name ?? '');
        return { slotIndex: idx, profile: ref };
    }
}
