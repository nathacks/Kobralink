import { BadRequestException, Controller, Get, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Roles } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { m } from '../i18n/locale';
import { SystemService } from './system.service';

type MulterFile = { originalname: string; buffer: Buffer; size: number };

@Controller('kx/system')
export class SystemController {
    constructor(private readonly system: SystemService) {}

    @Get()
    info() {
        return this.system.info();
    }

    @Post('update-check')
    checkUpdate() {
        return this.system.checkUpdate(true);
    }

    @Get('backup/info')
    backupInfo() {
        return this.system.backupInfo();
    }

    @Get('backup')
    @Roles(['admin'])
    async backup(@Query('timelapses') timelapses: string | undefined, @Res() res: Response) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="kobralink-backup-${stamp}.zip"`);
        await this.system.writeBackup(res, timelapses === 'true');
    }

    @Post('restore')
    @Roles(['admin'])
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 1 } }))
    async restore(@UploadedFiles() files: MulterFile[] | undefined) {
        const file = files?.[0];
        if (!file) throw new BadRequestException(m.api_no_file());
        const result = await this.system.stageRestore(file.buffer);
        this.system.scheduleRestart();
        return { ...result, restarting: true };
    }

    @Post('restart')
    @Roles(['admin'])
    restart() {
        this.system.scheduleRestart();
        return { restarting: true };
    }
}
