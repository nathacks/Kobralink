import {
    type AceAutoFeedInput,
    type AmsFeedInput,
    aceAutoFeedSchema,
    aceDrySchema,
    amsFeedSchema,
    amsSetSlotSchema,
    type DeletePrinterFilesInput,
    deletePrinterFilesSchema,
    type FileObjectsDto,
    type MoveAxisInput,
    moveAxisSchema,
    type PrinterLiveState,
    type PrintPrinterFileInput,
    printPrinterFileSchema,
    type SetFanInput,
    type SetLightInput,
    type SetSpeedInput,
    type SetTemperatureInput,
    type SkipObjectsInput,
    type SkipStateDto,
    type StartPrintInput,
    setFanSchema,
    setLightSchema,
    setSpeedSchema,
    setTemperatureSchema,
    skipObjectsSchema,
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
import type { z } from 'zod';

import { BridgeRegistry } from '../bridge/bridge.registry';
import { serveH264, serveSnapshot, serveStream } from '../bridge/camera';
import { BridgeOfflineError, type PrinterBridge } from '../bridge/printer-bridge';
import { localIpFor } from '../common/net';
import { ZodPipe } from '../common/zod.pipe';
import { GcodeService } from '../gcode/gcode.service';
import { m } from '../i18n/locale';

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

    @Post('ams/slot')
    @HttpCode(204)
    amsSlot(@Param('id') id: string, @Body(new ZodPipe(amsSetSlotSchema)) body: z.output<typeof amsSetSlotSchema>) {
        this.run(() => this.bridge(id).amsSetSlot(body.index, body.type, body.color));
    }

    @Post('ams/feed')
    @HttpCode(204)
    amsFeed(@Param('id') id: string, @Body(new ZodPipe(amsFeedSchema)) body: AmsFeedInput) {
        this.run(() => this.bridge(id).amsFeed(body.slotIndex, body.type));
    }

    @Post('ace/auto-feed')
    @HttpCode(204)
    aceAutoFeed(@Param('id') id: string, @Body(new ZodPipe(aceAutoFeedSchema)) body: AceAutoFeedInput) {
        this.run(() => this.bridge(id).aceAutoFeed(body.aceId, body.on));
    }

    @Post('ace/dry')
    @HttpCode(204)
    aceDry(@Param('id') id: string, @Body(new ZodPipe(aceDrySchema)) body: z.output<typeof aceDrySchema>) {
        this.run(() =>
            this.bridge(id).aceDry(body.action, {
                aceId: body.aceId,
                targetTemp: body.targetTemp,
                duration: body.duration,
            }),
        );
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

    @Get('camera/h264')
    cameraH264(@Param('id') id: string, @Res() res: Response) {
        return serveH264(this.bridge(id).camera, res);
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
        if (!file) throw new BadRequestException(m.api_no_file());
        if (!GcodeService.isAllowedFilename(file.originalname)) {
            throw new BadRequestException(m.api_gcode_only());
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
        if (!file) throw new NotFoundException(m.api_file_not_found());
        this.log.log(`Print requested: ${file.filename}`);
        const serveBase = await this.serveBase(bridge);
        return this.run(() =>
            bridge.printStoredFile(file.id, {
                serveBase,
                autoLeveling: body.autoLeveling,
                excludedObjects: body.excludedObjects,
            }),
        );
    }

    @Get('printer-files')
    printerFiles(@Param('id') id: string) {
        return this.run(() => this.bridge(id).listPrinterFiles());
    }

    @Post('printer-files/delete')
    @HttpCode(204)
    async deletePrinterFiles(
        @Param('id') id: string,
        @Body(new ZodPipe(deletePrinterFilesSchema)) body: DeletePrinterFilesInput,
    ) {
        await this.run(() => this.bridge(id).deletePrinterFiles(body.filenames));
    }

    @Post('printer-files/print')
    @HttpCode(204)
    async printPrinterFile(
        @Param('id') id: string,
        @Body(new ZodPipe(printPrinterFileSchema)) body: PrintPrinterFileInput,
    ) {
        this.log.log(`Print of a printer file requested: ${body.filename}`);
        await this.run(() => this.bridge(id).printPrinterFile(body.filename, body.sizeBytes ?? 0, body.autoLeveling));
    }

    @Get('printer-files/thumbnail')
    async printerFileThumbnail(@Param('id') id: string, @Query('filename') filename: string) {
        if (!filename) throw new BadRequestException(m.api_filename_required());
        const thumbnail = await this.run(() => this.bridge(id).printerFileThumbnail(filename));
        return { thumbnail };
    }

    @Get('files/:fileId/objects')
    async fileObjects(@Param('id') id: string, @Param('fileId') fileId: string): Promise<FileObjectsDto> {
        const info = await this.gcode.objects(fileId);
        if (!info) throw new NotFoundException(m.api_file_not_found());
        if (!info.names.length) this.bridge(id).requestFileObjects(info.filename);
        return { names: info.names, svgB64: info.svgB64 };
    }

    @Post('skip')
    @HttpCode(204)
    async skip(@Param('id') id: string, @Body(new ZodPipe(skipObjectsSchema)) body: SkipObjectsInput) {
        await this.run(() => this.bridge(id).skipObjects(body.names));
    }

    @Post('skip/query')
    async skipQuery(@Param('id') id: string): Promise<SkipStateDto> {
        await this.run(() => this.bridge(id).querySkip());
        return this.skipState(id);
    }

    @Get('skip/state')
    async skipState(@Param('id') id: string): Promise<SkipStateDto> {
        const s = this.bridge(id).snapshot();
        const file = s.filename ? await this.gcode.getByFilename(s.filename) : null;
        const info = file ? await this.gcode.objects(file.id) : null;
        return {
            filename: s.filename,
            objects: info?.names ?? [],
            skipped: s.skippedObjects,
            svgB64: info?.svgB64 ?? '',
            ts: s.skipTs,
        };
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
