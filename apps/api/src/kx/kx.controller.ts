import {
    type MoveAxisInput,
    moveAxisSchema,
    type PrinterLiveState,
    type SetFanInput,
    type SetLightInput,
    type SetSpeedInput,
    type SetTemperatureInput,
    type StartPrintInput,
    setFanSchema,
    setLightSchema,
    setSpeedSchema,
    setTemperatureSchema,
    startPrintSchema,
} from '@kobralink/shared';
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Logger,
    MessageEvent,
    NotFoundException,
    Param,
    Post,
    Query,
    Res,
    ServiceUnavailableException,
    Sse,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { fromEvent, map, merge, Observable, of, throttleTime } from 'rxjs';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { serveSnapshot, serveStream } from '../bridge/camera';
import { BridgeOfflineError, type PrinterBridge } from '../bridge/printer-bridge';
import { localIpFor } from '../common/net';
import { ZodPipe } from '../common/zod.pipe';
import { GcodeService } from '../gcode/gcode.service';

const UPLOAD_LIMIT = 512 * 1024 * 1024;
type MulterFile = { originalname: string; buffer: Buffer; size: number };

@Controller('kx/printers/:id')
export class KxController {
    private readonly log = new Logger(KxController.name);

    constructor(
        private readonly registry: BridgeRegistry,
        private readonly gcode: GcodeService,
    ) {}

    private bridge(id: string): PrinterBridge {
        return this.registry.get(id);
    }

    private run<T>(fn: () => T): T {
        try {
            return fn();
        } catch (e) {
            if (e instanceof BridgeOfflineError) throw new ServiceUnavailableException(e.message);
            throw e;
        }
    }

    @Get('state')
    state(@Param('id') id: string) {
        return this.bridge(id).snapshot();
    }

    @Sse('events')
    events(@Param('id') id: string): Observable<MessageEvent> {
        const bridge = this.bridge(id);
        const updates = (fromEvent(bridge, 'state') as Observable<PrinterLiveState>).pipe(
            throttleTime(500, undefined, { leading: true, trailing: true }),
        );
        return merge(of(bridge.snapshot()), updates).pipe(
            map((state): MessageEvent => ({ type: 'state', data: state as unknown as object })),
        );
    }

    @Post('temperature')
    @HttpCode(204)
    temperature(@Param('id') id: string, @Body(new ZodPipe(setTemperatureSchema)) body: SetTemperatureInput) {
        this.run(() => this.bridge(id).setTemperature(body.nozzle, body.bed));
    }

    @Post('fan')
    @HttpCode(204)
    fan(@Param('id') id: string, @Body(new ZodPipe(setFanSchema)) body: SetFanInput) {
        this.run(() => this.bridge(id).setFan(body.speed));
    }

    @Post('light')
    @HttpCode(204)
    light(@Param('id') id: string, @Body(new ZodPipe(setLightSchema)) body: SetLightInput) {
        this.run(() => this.bridge(id).setLight(body.on, body.brightness));
    }

    @Post('speed')
    @HttpCode(204)
    speed(@Param('id') id: string, @Body(new ZodPipe(setSpeedSchema)) body: SetSpeedInput) {
        this.run(() => this.bridge(id).setSpeedMode(body.mode));
    }

    @Post('axis')
    @HttpCode(204)
    axis(@Param('id') id: string, @Body(new ZodPipe(moveAxisSchema)) body: MoveAxisInput) {
        this.run(() => this.bridge(id).moveAxis(body.axis, body.moveType, body.distance));
    }

    @Post('axis/off')
    @HttpCode(204)
    axisOff(@Param('id') id: string) {
        this.run(() => this.bridge(id).disableSteppers());
    }

    @Post('print/pause')
    @HttpCode(204)
    async pause(@Param('id') id: string) {
        await this.run(() => this.bridge(id).pause());
    }

    @Post('print/resume')
    @HttpCode(204)
    async resume(@Param('id') id: string) {
        await this.run(() => this.bridge(id).resume());
    }

    @Post('print/cancel')
    @HttpCode(204)
    async cancel(@Param('id') id: string) {
        await this.run(() => this.bridge(id).cancel());
    }

    @Get('camera/stream')
    cameraStream(@Param('id') id: string, @Res() res: Response) {
        return serveStream(this.bridge(id).camera, res);
    }

    @Get('camera/snapshot')
    cameraSnapshot(@Param('id') id: string, @Res() res: Response) {
        return serveSnapshot(this.bridge(id).camera, res);
    }

    @Post('camera/start')
    async cameraStart(@Param('id') id: string) {
        const state = await this.run(() => this.bridge(id).startCamera());
        return { state };
    }

    @Post('camera/stop')
    @HttpCode(204)
    async cameraStop(@Param('id') id: string) {
        await this.run(() => this.bridge(id).stopCamera());
    }

    @Post('camera/reset')
    @HttpCode(204)
    cameraReset(@Param('id') id: string) {
        this.bridge(id).resetCamera();
    }

    @Post('file-ready/clear')
    @HttpCode(204)
    clearFileReady(@Param('id') id: string) {
        this.bridge(id).clearFileReady();
    }

    @Get('files')
    files(@Param('id') id: string) {
        return this.gcode.list(id);
    }

    @Post('files')
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: UPLOAD_LIMIT, files: 1 } }))
    async upload(
        @Param('id') id: string,
        @UploadedFiles() files: MulterFile[] | undefined,
        @Body() body: Record<string, string>,
    ) {
        const file = files?.[0];
        if (!file) throw new BadRequestException('Aucun fichier reçu');
        if (!GcodeService.isAllowedFilename(file.originalname)) {
            throw new BadRequestException('Seuls les fichiers .gcode / .bgcode sont acceptés');
        }
        const print = String(body.print ?? 'false') === 'true';
        const bridge = this.bridge(id);
        if (!print) {
            return this.gcode.save(id, file.originalname, file.buffer, true);
        }
        const serveBase = await this.serveBase(bridge);
        return this.run(() =>
            bridge.uploadAndPrint(file.originalname, file.buffer, {
                print: true,
                webUpload: true,
                serveBase,
            }),
        );
    }

    @Post('print')
    async print(@Param('id') id: string, @Body(new ZodPipe(startPrintSchema)) body: StartPrintInput) {
        const bridge = this.bridge(id);
        const file = await this.gcode.get(body.fileId);
        if (!file) throw new NotFoundException('Fichier introuvable');
        this.log.log(`Impression demandée: ${file.filename}`);
        const serveBase = await this.serveBase(bridge);
        return this.run(() => bridge.printStoredFile(file.id, { serveBase, autoLeveling: body.autoLeveling }));
    }

    @Delete('files/:fileId')
    @HttpCode(204)
    async deleteFile(@Param('fileId') fileId: string) {
        if (!(await this.gcode.delete(fileId))) throw new NotFoundException();
    }

    @Post('files/:fileId/verify')
    @HttpCode(204)
    async verifyFile(@Param('fileId') fileId: string) {
        if (!(await this.gcode.clearWebUnverified(fileId))) throw new NotFoundException();
    }

    @Get('files/:fileId/download')
    async download(@Param('fileId') fileId: string, @Res() res: Response) {
        const file = await this.gcode.get(fileId);
        if (!file) throw new NotFoundException();
        res.download(file.path, file.filename);
    }

    @Get('history')
    history(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
        return this.gcode.listJobs(id, Math.min(Number(limit) || 50, 200), Number(offset) || 0);
    }

    private async serveBase(bridge: PrinterBridge): Promise<string> {
        return `http://${localIpFor(bridge.config.ip)}:${bridge.config.httpPort}`;
    }
}
