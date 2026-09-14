import {
    All,
    Body,
    Controller,
    Get,
    HttpCode,
    Logger,
    NotFoundException,
    Param,
    Post,
    Query,
    Req,
    Res,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { serveH264, serveSnapshot, serveStream } from '../bridge/camera';
import { BridgeOfflineError } from '../bridge/printer-bridge';
import { localIpFor } from '../common/net';
import { GcodeService } from '../gcode/gcode.service';
import { m } from '../i18n/locale';
import { MoonrakerGateway } from './moonraker.gateway';
import { MoonrakerService } from './moonraker.service';

const UPLOAD_LIMIT = 512 * 1024 * 1024;
type MulterFile = { originalname: string; buffer: Buffer; size: number };

@Controller()
export class MoonrakerController {
    private readonly log = new Logger(MoonrakerController.name);

    constructor(
        private readonly moon: MoonrakerService,
        private readonly gateway: MoonrakerGateway,
        private readonly gcode: GcodeService,
    ) {}

    @Get()
    root(@Res() res: Response) {
        res.redirect(302, this.moon.uiUrl());
    }

    @Get('server/info')
    serverInfo() {
        return { result: this.moon.serverInfo(this.gateway.clientCount) };
    }

    @Get('printer/info')
    printerInfo() {
        return { result: this.moon.printerInfo() };
    }

    @Get('machine/system_info')
    systemInfo() {
        return { result: this.moon.systemInfo() };
    }

    @Get('printer/objects/list')
    objectsList() {
        return { result: { objects: Object.keys(this.moon.printerObjects()) } };
    }

    @Get('printer/objects/query')
    objectsQuery(@Query() query: Record<string, string>) {
        const requested = query.objects
            ? query.objects
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
            : Object.keys(query).filter(Boolean);
        return { result: { status: this.moon.filterObjects(requested), eventtime: Date.now() / 1000 } };
    }

    @All('printer/objects/subscribe')
    objectsSubscribe() {
        return { result: { status: this.moon.printerObjects(), eventtime: Date.now() / 1000 } };
    }

    @Get('server/files/list')
    filesList() {
        return { result: this.moon.fileList() };
    }

    @Get('server/files/metadata')
    async filesMetadata(@Query('filename') filename?: string) {
        const name = filename || this.moon.bridge.snapshot().filename;
        return { result: name ? await this.moon.fileMetadata(name) : {} };
    }

    @Get('access/api_key')
    apiKey() {
        return { result: 'kobralink-no-auth' };
    }

    @Get('machine/update/status')
    updateStatus() {
        return { result: { busy: false, version_info: {} } };
    }

    @Get('server/history/list')
    historyList(@Query('limit') limit?: string) {
        return this.moon.historyList(Number(limit) || 50).then((r) => ({ result: r }));
    }

    @Get('server/webcams/list')
    async webcams(@Req() req: Request) {
        const base = await this.publicBase(req);
        return { result: this.moon.webcams(base) };
    }

    @Get('api/camera/stream')
    cameraStream(@Res() res: Response) {
        return serveStream(this.moon.bridge.camera, res);
    }

    @Get('api/camera/h264')
    cameraH264(@Res() res: Response) {
        return serveH264(this.moon.bridge.camera, res);
    }

    @Get('api/camera/snapshot')
    cameraSnapshot(@Res() res: Response) {
        return serveSnapshot(this.moon.bridge.camera, res);
    }

    @Get('api/version')
    octoprintVersion() {
        return { server: '1.5.0', api: '0.1', text: 'OctoPrint 1.5.0 (Kobralink)' };
    }

    @Get('server/database/list')
    databaseList() {
        return { result: this.moon.databaseList() };
    }

    @Get('server/database/item')
    databaseGet(@Query('namespace') namespace = '', @Query('key') key = '', @Res() res: Response) {
        const { status, body } = this.moon.databaseGet(namespace, key);
        res.status(status).json(body);
    }

    @Post('server/database/item')
    databaseSet(
        @Body() body: Record<string, unknown> | undefined,
        @Query() query: Record<string, string>,
        @Res() res: Response,
    ) {
        const namespace = String(body?.namespace ?? query.namespace ?? '');
        const key = String(body?.key ?? query.key ?? '');
        if (!namespace || !key) {
            res.status(400).json({ error: { code: 400, message: 'namespace + key required' } });
            return;
        }
        res.json(this.moon.databaseSet(namespace, key, body?.value ?? query.value ?? null));
    }

    @All('printer/gcode/script')
    async gcodeScript(@Body() body: { script?: string } | undefined, @Query('script') q?: string) {
        return { result: await this.moon.execGcodeScript(body?.script ?? q ?? '') };
    }

    @Post('printer/print/start')
    async printStart(
        @Req() req: Request,
        @Body() body: { filename?: string; auto_leveling?: number } | undefined,
        @Query('filename') q?: string,
    ) {
        const filename = q || body?.filename || this.moon.bridge.lastUploadedFilename;
        if (!filename) return { error: 'no filename' };
        const file = await this.gcode.getByFilename(filename);
        if (!file) throw new NotFoundException(m.api_unknown_store_file({ name: filename }));
        await this.moon.bridge.printStoredFile(file.id, {
            serveBase: await this.publicBase(req),
            autoLeveling: body?.auto_leveling === undefined ? undefined : Boolean(body.auto_leveling),
        });
        return { result: 'ok' };
    }

    @Post('printer/print/pause')
    async printPause() {
        await this.moon.bridge.pause();
        return { result: 'ok' };
    }

    @Post('printer/print/resume')
    async printResume() {
        await this.moon.bridge.resume();
        return { result: 'ok' };
    }

    @Post('printer/print/cancel')
    async printCancel() {
        await this.moon.bridge.cancel();
        return { result: 'ok' };
    }

    @Post(['server/files/upload', 'api/files/local', 'api/files/*path'])
    @HttpCode(201)
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: UPLOAD_LIMIT, files: 1 } }))
    async upload(
        @UploadedFiles() files: MulterFile[] | undefined,
        @Body() body: Record<string, string>,
        @Query() query: Record<string, string>,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const file = files?.[0];
        if (!file) {
            res.status(400).json({ error: 'no file received' });
            return;
        }
        const remoteName = body.path?.trim() || file.originalname || 'upload.gcode';
        if (!GcodeService.isAllowedFilename(remoteName)) {
            res.status(400).json({ error: 'only GCode files allowed (.gcode, .bgcode)' });
            return;
        }
        const print = String(body.print ?? query.print ?? 'false').toLowerCase() === 'true';
        this.log.log(`Upload ${remoteName} (${file.size} B) print=${print}`);
        try {
            const stored = await this.moon.bridge.uploadAndPrint(remoteName, file.buffer, {
                print,
                serveBase: await this.publicBase(req),
            });
            res.status(201).json(this.octoprintUploadResponse(req, stored.filename));
        } catch (e) {
            const msg = (e as Error).message;
            this.log.error(`Upload failed: ${msg}`);
            res.status(e instanceof BridgeOfflineError ? 503 : 500).json({ error: msg });
        }
    }

    private octoprintUploadResponse(req: Request, name: string) {
        const host = req.headers.host ?? 'localhost';
        return {
            done: true,
            files: {
                local: {
                    name,
                    origin: 'local',
                    path: name,
                    refs: {
                        download: `http://${host}/api/files/local/${name}`,
                        resource: `http://${host}/api/files/local/${name}`,
                    },
                },
            },
            result: { item: { path: name, root: 'gcodes' }, action: 'create_file' },
        };
    }

    @Get('serve/:filename')
    async serve(@Param('filename') filename: string, @Res() res: Response) {
        const file = await this.gcode.getByFilename(filename);
        if (!file) throw new NotFoundException();
        res.sendFile(file.path);
    }

    private async publicBase(req: Request): Promise<string> {
        const host = req.headers.host ?? '';
        const port = this.moon.bridge.config.httpPort;
        if (host && !/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) return `http://${host}`;
        return `http://${localIpFor(this.moon.bridge.config.ip)}:${port}`;
    }
}
