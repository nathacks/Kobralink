import { Controller, Delete, Get, HttpCode, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TimelapseService } from './timelapse.service';

@Controller('kx')
export class TimelapseController {
    constructor(private readonly timelapses: TimelapseService) {}

    @Get('printers/:id/timelapses')
    listForPrinter(@Param('id') id: string) {
        return this.timelapses.list(id);
    }

    @Get('timelapses')
    list() {
        return this.timelapses.list();
    }

    @Get('timelapses/:id')
    get(@Param('id') id: string) {
        return this.timelapses.get(id);
    }

    @Get('timelapses/:id/video')
    async video(@Param('id') id: string, @Res() res: Response) {
        const file = await this.timelapses.video(id);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.sendFile(file);
    }

    @Get('timelapses/:id/poster')
    async poster(@Param('id') id: string, @Res() res: Response) {
        const file = await this.timelapses.poster(id);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.sendFile(file);
    }

    @Delete('timelapses/:id')
    @HttpCode(204)
    async remove(@Param('id') id: string) {
        await this.timelapses.remove(id);
    }
}
