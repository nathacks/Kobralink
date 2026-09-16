import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { DetectionService } from './detection.service';

@Controller('api/v1')
export class DetectionController {
    constructor(private readonly detection: DetectionService) {}

    @Get('detection')
    status() {
        return this.detection.status();
    }

    @Post('detection/model/download')
    download() {
        return this.detection.downloadModel();
    }

    @Post('detection/model/cancel')
    cancel() {
        return this.detection.cancelDownload();
    }

    @Delete('detection/model')
    remove() {
        return this.detection.deleteModel();
    }

    @Get('printers/:id/detection')
    printer(@Param('id') id: string) {
        return this.detection.printerStatus(id);
    }
}
