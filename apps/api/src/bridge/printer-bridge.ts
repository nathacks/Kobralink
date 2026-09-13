import { EventEmitter } from 'node:events';
import net from 'node:net';
import {
    type KobraFileData,
    type KobraInfoData,
    type KobraLightData,
    type KobraMessage,
    KobraMqttClient,
    type KobraMultiColorBoxData,
    type KobraPrintData,
    type KobraSkipData,
    type PrintStartPayload,
    uploadGcode,
} from '@kobralink/kobra-protocol';
import {
    ACTIVE_PRINT_STATES,
    type AceDrying,
    type AmsSlot,
    type FilamentMode,
    KOBRA_TO_KLIPPER_STATE,
    PRE_PRINT_STATES,
    type PrinterFileDto,
    type PrinterLiveState,
    type PrinterSettings,
    TERMINAL_PRINT_STATES,
} from '@kobralink/shared';
import { Logger } from '@nestjs/common';
import type { GcodeService, StoredFile } from '../gcode/gcode.service';
import {
    aggregateAceUnits,
    aggregateSlots,
    buildAutoAmsBoxMapping,
    detectFilamentMode,
    EMPTY_DRYING,
    globalToBoxSlot,
    slotActivityMap,
    slotUsableForPrint,
} from './ams';
import { CameraCache } from './camera';

export interface BridgePrinterConfig {
    id: string;
    name: string;
    ip: string;
    mqttPort: number;
    username: string;
    password: string;
    deviceId: string;
    modeId: string;
    httpPort: number;
    settings: PrinterSettings;
}

export interface BridgeEvents {
    state: [state: PrinterLiveState];
    log: [line: string];
}

interface LastUpload {
    filename: string;
    url: string;
    md5: string;
    size: number;
}

export class PrinterBridge extends EventEmitter<BridgeEvents> {
    readonly client: KobraMqttClient;
    private readonly log: Logger;
    readonly camera: CameraCache;
    private readonly s: PrinterLiveState;

    private running = false;
    private offline = true;
    private loopWake: (() => void) | null = null;
    private loopDone: Promise<void> | null = null;

    private filamentMode: FilamentMode = 'toolhead';
    private currentJobId = '';
    private currentJobFilename = '';
    private lastUpload: LastUpload | null = null;
    private layerHeight = 0;
    private firstLayerHeight = 0;
    private cameraAutostarted = false;
    private cameraUserStopped = false;
    private buried: {
        taskName: string;
        gcodeSize: number;
        estimateDuration: number;
        totalLayers: number;
    } | null = null;

    constructor(
        public config: BridgePrinterConfig,
        private readonly gcode: GcodeService,
        private readonly certs: { cert: Buffer; key: Buffer },
    ) {
        super();
        this.log = new Logger(`Bridge:${config.name}`);
        this.camera = new CameraCache(this.log);
        this.s = {
            printerId: config.id,
            connected: false,
            connectionError: '',
            printerName: config.name,
            firmwareVersion: 'unknown',
            printState: 'error',
            kobraState: 'offline',
            nozzleTemp: 0,
            nozzleTarget: 0,
            bedTemp: 0,
            bedTarget: 0,
            progress: 0,
            printDurationSec: 0,
            remainTimeSec: 0,
            currLayer: 0,
            totalLayers: 0,
            zMm: 0,
            filename: '',
            slicerTimeSec: 0,
            thumbnail: '',
            cameraUrl: '',
            fanSpeed: 0,
            printSpeedMode: 2,
            lightOn: false,
            lightBrightness: 0,
            taskId: '-1',
            fileReady: '',
            errorCode: 0,
            pauseMsg: '',
            filamentMode: 'toolhead',
            amsSlots: [],
            amsLoadedSlot: -1,
            aceUnits: [],
            aceDrying: EMPTY_DRYING,
            skippedObjects: [],
            skipTs: 0,
            storageTotalMb: 0,
            storageUsedMb: 0,
            updatedAt: Date.now(),
        };
        this.client = this.createClient();
    }

    private createClient(): KobraMqttClient {
        const c = this.config;
        const client = new KobraMqttClient({
            host: c.ip,
            port: c.mqttPort,
            username: c.username,
            password: c.password,
            modeId: c.modeId,
            deviceId: c.deviceId,
            cert: this.certs.cert,
            key: this.certs.key,
            clientId: 'kobralink',
            logger: {
                debug: (m) => this.log.debug(m),
                info: (m) => this.log.log(m),
                warn: (m) => this.log.warn(m),
                error: (m) => this.log.error(m),
            },
        });
        client.on('report', (suffix, payload) => this.onReport(suffix, payload));
        client.on('disconnected', (reason) => {
            if (reason === 'requested' || !this.running) return;
            this.markOffline(`Connexion MQTT perdue (${this.config.ip})`);
            this.wakeLoop();
        });
        return client;
    }

    get id(): string {
        return this.config.id;
    }

    get settings(): PrinterSettings {
        return this.config.settings;
    }

    snapshot(): PrinterLiveState {
        return { ...this.s, amsSlots: this.s.amsSlots.map((x) => ({ ...x })) };
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.offline = true;
        this.loopDone = this.pollLoop();
    }

    async stop(): Promise<void> {
        this.running = false;
        this.wakeLoop();
        this.camera.stop();
        await this.client.disconnect();
        await this.loopDone;
        this.loopDone = null;
    }

    async updateConfig(next: BridgePrinterConfig): Promise<void> {
        const prev = this.config;
        this.config = next;
        this.s.printerName = next.name;
        const reconnect =
            prev.ip !== next.ip ||
            prev.mqttPort !== next.mqttPort ||
            prev.username !== next.username ||
            prev.password !== next.password ||
            prev.deviceId !== next.deviceId ||
            prev.modeId !== next.modeId;
        if (reconnect && this.running) {
            await this.client.disconnect();
            this.markOffline('Reconnexion…');
            this.wakeLoop();
        }
        this.publish();
    }

    private wakeLoop(): void {
        this.loopWake?.();
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            let t: NodeJS.Timeout;
            const done = () => {
                clearTimeout(t);
                this.loopWake = null;
                resolve();
            };
            t = setTimeout(done, ms);
            this.loopWake = done;
        });
    }

    private markOffline(error: string): void {
        this.offline = true;
        this.s.connected = false;
        this.s.printState = 'error';
        this.s.kobraState = 'offline';
        this.s.connectionError = error;
        this.publish();
    }

    private printerReachable(): Promise<boolean> {
        return new Promise((resolve) => {
            const sock = net.connect({ host: this.config.ip, port: this.config.mqttPort });
            const finish = (ok: boolean) => {
                sock.destroy();
                resolve(ok);
            };
            sock.setTimeout(2000, () => finish(false));
            sock.once('connect', () => finish(true));
            sock.once('error', () => finish(false));
        });
    }

    private async pollLoop(): Promise<void> {
        const probeInterval = 10000;
        while (this.running) {
            if (this.offline) {
                if (!(await this.printerReachable())) {
                    await this.sleep(probeInterval);
                    continue;
                }
                try {
                    this.log.log('Imprimante joignable — ouverture de la session MQTT…');
                    await this.client.connect();
                    this.offline = false;
                    this.s.connected = true;
                    this.s.connectionError = '';
                    this.s.printState = 'standby';
                    this.s.kobraState = 'free';
                    this.publish();
                } catch (e) {
                    const msg = mqttErrorMessage(e);
                    this.s.connectionError = msg;
                    this.publish();
                    this.log.warn(`Connexion échouée: ${msg}`);
                    await this.sleep(probeInterval);
                    continue;
                }
            }

            try {
                const info = await this.client.queryInfo();
                if (info) {
                    this.onInfo(info);
                } else if (!this.client.connected) {
                    this.log.warn('Session MQTT morte (aucune réponse) — passage hors ligne');
                    this.markOffline(`Connexion MQTT perdue (${this.config.ip})`);
                    await this.client.disconnect();
                    await this.sleep(this.pollIntervalMs());
                    continue;
                }
                if (ACTIVE_PRINT_STATES.has(this.s.kobraState) || this.s.printState === 'paused') {
                    const pr = await this.client.queryPrint();
                    if (pr) this.onPrint(pr);
                }
                const box = await this.client.queryMultiColorBox();
                if (box) this.onMultiColorBox(box);
            } catch (e) {
                this.log.warn(`Erreur de poll: ${(e as Error).message}`);
                if (!(await this.printerReachable())) {
                    this.markOffline(`Imprimante injoignable (${this.config.ip})`);
                    await this.client.disconnect();
                }
            }
            await this.sleep(this.pollIntervalMs());
        }
    }

    private pollIntervalMs(): number {
        return Math.max(1, this.config.settings.pollIntervalSec) * 1000;
    }

    private publish(): void {
        this.s.updatedAt = Date.now();
        this.s.zMm = this.estimateZ();
        this.emit('state', this.snapshot());
    }

    private onReport(suffix: string, payload: KobraMessage): void {
        switch (suffix) {
            case 'tempature/report':
                this.onTemp(payload as KobraMessage<Partial<Record<string, number>>>);
                break;
            case 'print/report':
                this.onPrint(payload as KobraMessage<KobraPrintData>);
                break;
            case 'info/report':
                this.onInfo(payload as KobraMessage<KobraInfoData>);
                break;
            case 'multiColorBox/report':
                this.onMultiColorBox(payload as KobraMessage<KobraMultiColorBoxData>);
                break;
            case 'light/report':
                this.onLight(payload as KobraMessage<KobraLightData>);
                break;
            case 'file/report':
                this.onFile(payload as KobraMessage<KobraFileData>);
                break;
            case 'skip/report':
                this.onSkip(payload as KobraMessage<KobraSkipData>);
                break;
            case 'buried/report':
                this.onBuried(payload as KobraMessage<Record<string, unknown>>);
                break;
            default:
                break;
        }
    }

    private onTemp(p: KobraMessage<Partial<Record<string, number>>>): void {
        const d = p.data ?? {};
        this.s.nozzleTemp = Number(d.curr_nozzle_temp ?? 0);
        this.s.nozzleTarget = Number(d.target_nozzle_temp ?? 0);
        this.s.bedTemp = Number(d.curr_hotbed_temp ?? 0);
        this.s.bedTarget = Number(d.target_hotbed_temp ?? 0);
        this.publish();
    }

    private applyKobraState(kobraState: string, fallback: 'printing' | 'standby'): void {
        this.s.printState = KOBRA_TO_KLIPPER_STATE[kobraState] ?? fallback;
        this.s.kobraState = kobraState;
        if (kobraState === 'printing') {
            if (this.config.settings.cameraOnPrint && !this.cameraAutostarted && !this.cameraUserStopped) {
                this.cameraAutostarted = true;
                void this.client.startCamera().catch((e) => this.log.warn(`Caméra auto: ${String(e)}`));
            }
        } else if (kobraState === 'free' || TERMINAL_PRINT_STATES.has(kobraState)) {
            this.cameraAutostarted = false;
            this.cameraUserStopped = false;
        }
    }

    private onPrint(p: KobraMessage<KobraPrintData>): void {
        const d = p.data ?? {};
        const kobraState = p.state ?? '';
        if (kobraState) this.applyKobraState(kobraState, 'printing');

        if (kobraState === 'pause' || kobraState === 'paused') {
            if (p.msg) {
                this.s.errorCode = Number(p.code ?? 0);
                this.s.pauseMsg = p.msg;
                this.log.warn(`Imprimante en pause: [${this.s.errorCode}] ${p.msg}`);
            }
        } else if (['resuming', 'resumed', 'printing', 'finished', 'stoped', 'canceled'].includes(kobraState)) {
            this.s.errorCode = 0;
            this.s.pauseMsg = '';
        }

        if (kobraState === 'printing' && !this.currentJobId) {
            const filename = d.filename ?? this.s.filename;
            if (filename) void this.beginJob(filename);
        }

        if (kobraState === 'finished' && this.currentJobId) {
            void this.gcode.finishJob(this.currentJobId, 'completed');
            this.log.log(`Impression terminée: ${this.currentJobFilename}`);
            if (this.config.settings.deletePrinterFileAfterPrint && this.currentJobFilename) {
                const name = this.currentJobFilename;
                setTimeout(() => {
                    this.deletePrinterFiles([name])
                        .then(() => this.log.log(`Fichier supprimé de l'imprimante: ${name}`))
                        .catch((e) => this.log.warn(`Suppression sur l'imprimante impossible (${name}): ${e.message}`));
                }, 3000);
            }
            this.currentJobId = '';
            this.currentJobFilename = '';
        } else if ((kobraState === 'stoped' || kobraState === 'canceled') && this.currentJobId) {
            void this.gcode.finishJob(this.currentJobId, 'cancelled');
            this.log.log(`Impression annulée: ${this.currentJobFilename}`);
            this.currentJobId = '';
            this.currentJobFilename = '';
        }

        if (TERMINAL_PRINT_STATES.has(kobraState)) {
            this.resetPrintFields();
        } else {
            this.s.filename = d.filename ?? this.s.filename;
        }
        if (d.progress !== undefined && !PRE_PRINT_STATES.has(kobraState)) this.s.progress = Number(d.progress) / 100;
        if (d.print_time !== undefined) this.s.printDurationSec = Number(d.print_time) * 60;
        if (d.remain_time !== undefined) this.s.remainTimeSec = Number(d.remain_time) * 60;
        if (d.curr_layer !== undefined) this.s.currLayer = Number(d.curr_layer);
        if (d.total_layers !== undefined) this.s.totalLayers = Number(d.total_layers);
        if (d.taskid !== undefined) this.s.taskId = String(d.taskid);
        if (d.settings?.print_speed_mode !== undefined) this.s.printSpeedMode = Number(d.settings.print_speed_mode);
        this.publish();
    }

    private resetPrintFields(): void {
        this.s.progress = 0;
        this.s.filename = '';
        this.s.fileReady = '';
        this.s.printDurationSec = 0;
        this.s.remainTimeSec = 0;
        this.s.slicerTimeSec = 0;
        this.s.currLayer = 0;
        this.s.totalLayers = 0;
        this.s.thumbnail = '';
        this.layerHeight = 0;
        this.firstLayerHeight = 0;
    }

    private async beginJob(filename: string): Promise<void> {
        if (this.currentJobId) return;
        const file = await this.gcode.getByFilename(filename);
        this.currentJobId = await this.gcode.startJob(this.config.id, filename, file?.id ?? null);
        this.currentJobFilename = filename;
        if (file) this.adoptFileMeta(file);
        this.log.log(`Job démarré: ${filename}`);
    }

    private adoptFileMeta(file: StoredFile): void {
        if (!this.s.slicerTimeSec) this.s.slicerTimeSec = file.estPrintTimeSec;
        if (!this.s.thumbnail && file.thumbnail) this.s.thumbnail = file.thumbnail;
        if (!this.layerHeight) {
            this.layerHeight = file.layerHeight;
            this.firstLayerHeight = file.firstLayerHeight || file.layerHeight;
        }
    }

    private onInfo(p: KobraMessage<KobraInfoData>): void {
        const d = p.data ?? {};
        this.s.firmwareVersion = String(d.version ?? this.s.firmwareVersion);

        const project = d.project ?? {};
        const kobraState = project.state || d.state || '';
        if (kobraState) {
            this.applyKobraState(kobraState, 'standby');
            if (TERMINAL_PRINT_STATES.has(kobraState)) {
                this.s.fileReady = '';
                this.s.currLayer = 0;
                this.s.totalLayers = 0;
            }
        }
        if (project.filename !== undefined && !TERMINAL_PRINT_STATES.has(kobraState))
            this.s.filename = project.filename;
        if (project.progress !== undefined && !PRE_PRINT_STATES.has(kobraState)) {
            this.s.progress = Number(project.progress) / 100;
        }
        if (project.print_time !== undefined) this.s.printDurationSec = Number(project.print_time) * 60;
        if (project.remain_time !== undefined) this.s.remainTimeSec = Number(project.remain_time) * 60;
        if (project.curr_layer !== undefined) this.s.currLayer = Number(project.curr_layer);
        if (project.total_layers !== undefined) this.s.totalLayers = Number(project.total_layers);
        if (project.taskid !== undefined) this.s.taskId = String(project.taskid);
        if (d.temp) {
            this.s.nozzleTemp = Number(d.temp.curr_nozzle_temp ?? 0);
            this.s.nozzleTarget = Number(d.temp.target_nozzle_temp ?? 0);
            this.s.bedTemp = Number(d.temp.curr_hotbed_temp ?? 0);
            this.s.bedTarget = Number(d.temp.target_hotbed_temp ?? 0);
        }
        if (d.urls) {
            const keys = Object.keys(d.urls).sort().join(',');
            if (keys !== this.knownUrlKeys) {
                this.knownUrlKeys = keys;
                this.log.log(`URLs annoncées par l'imprimante: ${JSON.stringify(d.urls)}`);
            }
            const dl = Object.entries(d.urls).find(([k, v]) => /download/i.test(k) && typeof v === 'string');
            this.downloadUrlTemplate = dl?.[1] ?? '';
        }
        if (d.urls?.fileUploadurl) this.uploadUrl = d.urls.fileUploadurl;
        if (d.urls?.rtspUrl) {
            this.s.cameraUrl = d.urls.rtspUrl;
            this.camera.setUrl(d.urls.rtspUrl);
        }
        if (d.fan_speed_pct !== undefined) this.s.fanSpeed = Number(d.fan_speed_pct);
        if (d.print_speed_mode !== undefined) this.s.printSpeedMode = Number(d.print_speed_mode);
        if (kobraState === 'printing' && !this.currentJobId && this.s.filename) void this.beginJob(this.s.filename);
        this.publish();
    }

    private uploadUrl = '';

    private onMultiColorBox(p: KobraMessage<KobraMultiColorBoxData>): void {
        if (p.state === 'failed') {
            this.log.warn(`multiColorBox rejeté par l'imprimante: ${JSON.stringify(p.data)}`);
            return;
        }
        const boxes = p.data?.multi_color_box ?? [];
        if (!boxes.length) return;
        this.filamentMode = detectFilamentMode(boxes);
        this.s.filamentMode = this.filamentMode;
        const { slots, loaded } = aggregateSlots(boxes, this.filamentMode);
        const activity = slotActivityMap(boxes, loaded, this.filamentMode);
        for (const s of slots) s.activity = activity.get(s.globalIndex) ?? '';

        for (const box of boxes) {
            const fs = box.feed_status;
            if (fs && (fs.current_status === 10 || fs.current_status === 11)) {
                const boxId = box.id;
                const slot = fs.slot_index ?? 0;
                setTimeout(() => {
                    this.client.send('multiColorBox', 'feedFilament', {
                        multi_color_box: [{ id: boxId, feed_status: { slot_index: slot, type: 3 } }],
                    });
                }, 2000);
            }
        }
        const ace = aggregateAceUnits(boxes, this.s.aceUnits);
        this.s.aceUnits = ace.units;
        this.s.aceDrying = ace.drying;
        if (slots.length) {
            this.s.amsSlots = slots;
            this.s.amsLoadedSlot = loaded;
        }
        this.publish();
    }

    private onLight(p: KobraMessage<KobraLightData>): void {
        const d = p.data ?? {};
        this.s.lightOn = Boolean(d.status);
        this.s.lightBrightness = Number(d.brightness ?? 80);
        this.publish();
    }

    private knownUrlKeys = '';
    private downloadUrlTemplate = '';

    printerFileDownloadUrl(filename: string): string {
        const encoded = encodeURIComponent(filename);
        if (this.downloadUrlTemplate) {
            const t = this.downloadUrlTemplate;
            if (t.includes('{filename}')) return t.replace('{filename}', encoded);
            return `${t}${t.includes('?') ? '&' : '?'}filename=${encoded}`;
        }
        if (!this.uploadUrl)
            throw new Error("URL d'accès aux fichiers de l'imprimante inconnue (pas encore de rapport info)");
        const u = new URL(this.uploadUrl);
        const token = u.searchParams.get('s') ?? '';
        return `http://${u.hostname}:${u.port || 18910}/gcode_download?s=${encodeURIComponent(token)}&filename=${encoded}`;
    }

    private readonly fileWaiters = new Map<string, (m: KobraMessage<KobraFileData>) => void>();
    private readonly printerThumbs = new Map<string, string>();

    private waitFileAction(
        action: string,
        send: () => void,
        timeoutMs = 8000,
    ): Promise<KobraMessage<KobraFileData> | null> {
        this.ensureConnected();
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (this.fileWaiters.get(action) === done) this.fileWaiters.delete(action);
                resolve(null);
            }, timeoutMs);
            const done = (m: KobraMessage<KobraFileData>) => {
                clearTimeout(timer);
                this.fileWaiters.delete(action);
                resolve(m);
            };
            this.fileWaiters.set(action, done);
            send();
        });
    }

    async listPrinterFiles(): Promise<PrinterFileDto[]> {
        const res = await this.waitFileAction('listLocal', () => this.client.listLocalFiles(), 15000);
        if (res?.code !== 200) throw new Error("L'imprimante n'a pas renvoyé la liste de ses fichiers");
        return (res.data?.records ?? [])
            .filter((r) => !r.is_dir)
            .map((r) => ({ filename: r.filename, sizeBytes: Number(r.size ?? 0), timestamp: Number(r.timestamp ?? 0) }))
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    async deletePrinterFiles(filenames: string[]): Promise<void> {
        const res = await this.waitFileAction('deleteBatch', () => this.client.deleteLocalFiles(filenames));
        if (res?.state !== 'success') throw new Error("Suppression refusée par l'imprimante");
        for (const f of filenames) this.printerThumbs.delete(f);
    }

    async printerFileThumbnail(filename: string): Promise<string> {
        const cached = this.printerThumbs.get(filename);
        if (cached !== undefined) return cached;
        const res = await this.waitFileAction('fileDetails', () => this.client.requestFileDetails(filename), 5000);
        if (!res) throw new Error('Miniature indisponible');
        const thumb = res.data?.file_details?.thumbnail ?? res.data?.file_details?.png_image ?? '';
        this.printerThumbs.set(filename, thumb);
        return thumb;
    }

    private onFile(p: KobraMessage<KobraFileData>): void {
        const waiter = this.fileWaiters.get(p.action);
        if (waiter) waiter(p);
        if (p.action === 'listLocal' || p.action === 'deleteBatch') return;
        const d = p.data ?? {};
        const details = d.file_details ?? {};
        const thumb = details.thumbnail || details.png_image || '';
        const fileName = d.filename || details.filename || this.lastUpload?.filename || '';
        const active = this.s.printState === 'printing' || this.s.printState === 'paused';
        if (thumb && (!active || fileName === this.s.filename)) {
            this.s.thumbnail = thumb;
            this.publish();
        }
        const objects = details.objects_skip_parts ?? [];
        if (objects.length && fileName) {
            void this.gcode.updateObjects(fileName, objects, details.svg_image ?? '').catch((e) => {
                this.log.warn(`Mise à jour des objets impossible pour ${fileName}: ${(e as Error).message}`);
            });
        }
    }

    private pendingPreprintSkip: string[] = [];
    private pendingPreprintDeadline = 0;

    private onSkip(p: KobraMessage<KobraSkipData>): void {
        const d = p.data ?? {};
        let skipped = (d.objects_skip_parts ?? d.skipped ?? d.skipped_parts ?? []).map(String).filter(Boolean);
        if (!skipped.length && this.pendingPreprintSkip.length && Date.now() <= this.pendingPreprintDeadline) return;
        const active = this.s.printState === 'printing' || this.s.printState === 'paused';
        const existing = this.s.skippedObjects;
        if (active && existing.length) {
            if (!skipped.length) skipped = [...existing];
            else if (!existing.every((n) => skipped.includes(n))) {
                skipped = [...existing, ...skipped.filter((n) => !existing.includes(n))];
            }
        }
        if (this.pendingPreprintSkip.length && this.pendingPreprintSkip.every((n) => skipped.includes(n))) {
            this.pendingPreprintSkip = [];
            this.pendingPreprintDeadline = 0;
        }
        this.s.skippedObjects = skipped;
        this.s.skipTs = Date.now();
        this.publish();
    }

    async skipObjects(names: string[]): Promise<void> {
        this.ensureConnected();
        const res = await this.client.skipObjects(names);
        if (!res) throw new Error("Pas de réponse de l'imprimante (skip)");
        if (res.state === 'failed') throw new Error(`Skip refusé par l'imprimante`);
    }

    async querySkip(): Promise<void> {
        this.ensureConnected();
        const prev = this.s.skipTs;
        void this.client.querySkipObjects();
        const deadline = Date.now() + 1500;
        while (Date.now() < deadline && this.s.skipTs <= prev) await this.sleep(100);
    }

    requestFileObjects(filename: string): void {
        if (this.client.connected) this.client.requestFileDetails(filename);
    }

    private async applyPreprintSkip(names: string[]): Promise<void> {
        this.pendingPreprintSkip = [...names];
        this.pendingPreprintDeadline = Date.now() + 20_000;
        for (let i = 0; i < 20; i++) {
            if (!this.running) break;
            if (this.s.printState === 'printing' || this.s.printState === 'paused') {
                const res = await this.client.skipObjects(names).catch(() => null);
                if (res) {
                    this.log.log(`Skip pré-impression appliqué (${names.length} objets)`);
                    this.pendingPreprintSkip = [];
                    this.pendingPreprintDeadline = 0;
                    return;
                }
            }
            await this.sleep(750);
        }
        this.log.warn('Skip pré-impression non confirmé');
        this.pendingPreprintSkip = [];
        this.pendingPreprintDeadline = 0;
    }

    private onBuried(p: KobraMessage<Record<string, unknown>>): void {
        const d = p.data ?? {};
        const taskName = String(d.task_name ?? '');
        if (!taskName) return;
        this.buried = {
            taskName,
            gcodeSize: Number(d.gcode_size ?? 0),
            estimateDuration: Number(d.estimate_duration ?? 0),
            totalLayers: Number(d.total_layers ?? 0),
        };
        this.s.storageTotalMb = Number(d.storage_total ?? 0);
        this.s.storageUsedMb = Number(d.storage_used ?? 0);
        this.publish();
    }

    private estimateZ(): number {
        let lh = this.layerHeight;
        let fh = this.firstLayerHeight;
        if (!lh && this.s.filename) {
            const m = /_(\d+\.\d+)mm_/.exec(this.s.filename) ?? /(\d+\.\d+)mm/.exec(this.s.filename);
            if (m) {
                lh = Number.parseFloat(m[1]);
                fh = fh || lh;
            }
        }
        if (!lh || !this.s.currLayer) return 0;
        return Math.round((fh + Math.max(0, this.s.currLayer - 1) * lh) * 1000) / 1000;
    }

    async fileMetadata(filename: string): Promise<Record<string, unknown>> {
        const tracked = Boolean(filename) && filename === this.s.filename;
        let layerH = tracked ? this.layerHeight : 0;
        let firstH = tracked ? this.firstLayerHeight : 0;
        let totalLayers = tracked ? this.s.totalLayers : 0;
        let estTime = tracked ? this.s.slicerTimeSec : 0;
        let size = 0;
        const gf = await this.gcode.getByFilename(filename);
        if (gf) {
            if (!layerH) {
                layerH = gf.layerHeight;
                firstH = gf.firstLayerHeight || layerH;
            }
            if (!estTime) estTime = gf.estPrintTimeSec;
            size = gf.sizeBytes;
        }
        if (this.buried && this.buried.taskName === filename) {
            totalLayers ||= this.buried.totalLayers;
            estTime ||= this.buried.estimateDuration;
            size ||= this.buried.gcodeSize;
        }
        const objectHeight =
            layerH && totalLayers ? Math.round((firstH + (totalLayers - 1) * layerH) * 1000) / 1000 : 0;
        return {
            filename,
            size: size || 1,
            modified: Date.now() / 1000,
            estimated_time: estTime || null,
            layer_height: layerH || null,
            first_layer_height: firstH || null,
            layer_count: totalLayers || null,
            object_height: objectHeight || null,
            thumbnails: [],
        };
    }

    get lastUploadedFilename(): string {
        return this.lastUpload?.filename ?? '';
    }

    private ensureConnected(): void {
        if (!this.client.connected) throw new BridgeOfflineError(this.s.connectionError || 'Imprimante hors ligne');
    }

    setTemperature(nozzle?: number, bed?: number): void {
        this.ensureConnected();
        if (this.s.printState === 'printing') this.client.setPrintingTemperature(this.s.taskId, nozzle, bed);
        else this.client.setIdleTemperature(nozzle, bed);
        if (nozzle !== undefined) this.s.nozzleTarget = nozzle;
        if (bed !== undefined) this.s.bedTarget = bed;
        this.publish();
    }

    setFan(pct: number): void {
        this.ensureConnected();
        this.client.setFan(pct);
        this.s.fanSpeed = pct;
        this.publish();
    }

    setLight(on: boolean, brightness?: number): void {
        this.ensureConnected();
        const b = brightness ?? this.s.lightBrightness;
        this.client.setLight(on, b);
        this.s.lightOn = on;
        this.s.lightBrightness = b;
        this.publish();
    }

    setSpeedMode(mode: number): void {
        this.ensureConnected();
        this.client.setPrintSpeedMode(this.s.taskId, mode);
        this.s.printSpeedMode = mode;
        this.publish();
    }

    moveAxis(axis: number, moveType: number, distance: number): void {
        this.ensureConnected();
        this.client.moveAxis(axis, moveType, distance);
    }

    disableSteppers(): void {
        this.ensureConnected();
        this.client.disableSteppers();
    }

    amsSetSlot(globalIndex: number, type: string, color: [number, number, number]): void {
        this.ensureConnected();
        const { boxId, localSlot } = globalToBoxSlot(this.s.amsSlots, globalIndex, this.filamentMode);
        this.client.setAmsSlotInfo(boxId, localSlot, type, color);
        const slot = this.s.amsSlots.find((x) => x.globalIndex === globalIndex);
        if (slot) {
            slot.type = type;
            slot.color = color;
        }
        this.publish();
    }

    amsFeed(globalIndex: number, type: 1 | 2): void {
        this.ensureConnected();
        const target = type === 2 && this.s.amsLoadedSlot >= 0 ? this.s.amsLoadedSlot : globalIndex;
        const { boxId, localSlot } = globalToBoxSlot(this.s.amsSlots, target, this.filamentMode);
        this.client.feedFilament(boxId, localSlot, type);
    }

    aceAutoFeed(aceId: number, on: boolean): void {
        this.ensureConnected();
        this.client.setAutoFeed(aceId, on);
        const unit = this.s.aceUnits.find((u) => u.id === aceId);
        if (unit) unit.autoFeed = on;
        this.publish();
    }

    aceDry(action: 'start' | 'stop', opts: { aceId?: number; targetTemp: number; duration: number }): void {
        this.ensureConnected();
        let ids = this.s.aceUnits.map((u) => u.id);
        if (!ids.length)
            ids = [...new Set(this.s.amsSlots.filter((x) => x.boxId >= 0 && x.boxId <= 3).map((x) => x.boxId))];
        if (!ids.length && this.filamentMode !== 'toolhead') ids = [0];
        if (!ids.length) throw new BridgeOfflineError('Aucun ACE détecté');
        if (opts.aceId !== undefined) {
            if (!ids.includes(opts.aceId)) throw new BridgeOfflineError(`ACE ${opts.aceId + 1} non détecté`);
            ids = [opts.aceId];
        }
        const drying =
            action === 'start'
                ? { status: 1, target_temp: opts.targetTemp, duration: opts.duration, remain_time: opts.duration }
                : { status: 0 };
        this.client.setDry(ids, drying);
        const next: AceDrying = {
            ...this.s.aceDrying,
            status: action === 'start' ? 1 : 0,
            targetTemp: action === 'start' ? opts.targetTemp : 0,
            duration: action === 'start' ? opts.duration : 0,
            remainTime: action === 'start' ? opts.duration : 0,
        };
        for (const u of this.s.aceUnits) if (ids.includes(u.id)) u.drying = { ...u.drying, ...next };
        this.s.aceDrying = next;
        this.publish();
    }

    async pause(): Promise<void> {
        this.ensureConnected();
        await this.client.pausePrint(this.s.taskId);
    }

    async resume(): Promise<void> {
        this.ensureConnected();
        await this.client.resumePrint(this.s.taskId);
    }

    async cancel(): Promise<void> {
        this.ensureConnected();
        await this.client.stopPrint(this.s.taskId);
    }

    async startCamera(): Promise<string> {
        this.ensureConnected();
        const result = await this.client.startCamera();
        this.log.log(`Caméra startCapture: state=${result?.state ?? 'timeout'}`);
        this.cameraUserStopped = false;
        this.camera.reset();
        await new Promise((r) => setTimeout(r, 1500));
        return result?.state ?? '';
    }

    async stopCamera(): Promise<void> {
        this.ensureConnected();
        this.cameraUserStopped = true;
        this.camera.stop();
        await this.client.stopCamera();
    }

    resetCamera(): void {
        this.camera.reset();
        this.camera.ensureRunning();
    }

    clearFileReady(): void {
        this.s.fileReady = '';
        this.publish();
    }

    async reconnectNow(): Promise<void> {
        await this.client.disconnect();
        this.markOffline('Reconnexion…');
        this.wakeLoop();
    }

    async uploadAndPrint(
        filename: string,
        data: Buffer,
        opts: { print: boolean; webUpload?: boolean; serveBase: string },
    ): Promise<StoredFile> {
        const file = await this.gcode.save(this.config.id, filename, data, opts.webUpload ?? false);
        this.ensureConnected();
        await this.pushToPrinter(file, data);
        if (opts.print) {
            await this.startPrint(file, { serveBase: opts.serveBase });
        } else {
            this.s.fileReady = file.filename;
            this.publish();
        }
        return file;
    }

    private async pushToPrinter(file: StoredFile, data: Buffer): Promise<void> {
        if (!this.uploadUrl) {
            const info = await this.client.queryInfo();
            const url = info?.data?.urls?.fileUploadurl;
            if (!url) throw new Error("L'imprimante n'a pas fourni d'URL d'upload (info/report)");
            this.uploadUrl = url;
        }
        this.log.log(`Upload vers l'imprimante: ${file.filename} (${data.length} o)`);
        const result = await uploadGcode(this.config.ip, this.uploadUrl, file.filename, data);
        this.log.log(`Upload OK: ${JSON.stringify(result)}`);
        this.lastUpload = { filename: file.filename, url: '', md5: file.md5, size: file.sizeBytes };

        this.s.thumbnail = '';
        this.client.requestFileDetails(file.filename);
    }

    async printStoredFile(
        fileId: string,
        opts: { serveBase: string; autoLeveling?: boolean; excludedObjects?: string[] },
    ): Promise<StoredFile> {
        this.ensureConnected();
        const loaded = await this.gcode.readData(fileId);
        if (!loaded) throw new Error('Fichier introuvable dans le GCode store');
        await this.pushToPrinter(loaded.file, loaded.data);
        await this.startPrint(loaded.file, opts);
        return loaded.file;
    }

    private loadedSlotsForPrint(): AmsSlot[] {
        const all = this.s.amsSlots.filter((s) => slotUsableForPrint(s, this.filamentMode));
        const wanted = this.config.settings.defaultAmsSlot;
        if (wanted === 'auto') return all;
        const fixed = all.filter((s) => s.globalIndex === wanted);
        if (fixed.length) return fixed;
        this.log.warn(`Slot par défaut ${wanted} vide — retour au mode auto`);
        return all;
    }

    async printPrinterFile(filename: string, sizeBytes: number, autoLeveling?: boolean): Promise<void> {
        this.ensureConnected();
        this.s.fileReady = '';
        this.s.skippedObjects = [];
        this.s.skipTs = Date.now();
        const mapping = buildAutoAmsBoxMapping(this.loadedSlotsForPrint(), this.filamentMode);
        const payload: PrintStartPayload = {
            taskid: '-1',
            url: '',
            filename,
            md5: '',
            filepath: `/${filename}`,
            filetype: 1,
            project_type: 1,
            filesize: sizeBytes,
            ams_settings: { use_ams: mapping.length > 0, ams_box_mapping: mapping },
            task_settings: this.taskSettings(autoLeveling, []),
        };
        this.s.slicerTimeSec = 0;
        this.s.thumbnail = this.printerThumbs.get(filename) ?? '';
        this.log.log(`print/start (fichier imprimante) → ${filename}  ams=${mapping.length} slots`);
        const result = await this.client.startPrint(payload);
        if (!result) throw new Error("Pas de réponse de l'imprimante au démarrage de l'impression");
        if (result.state === 'failed' || (result.code !== undefined && result.code !== 0)) {
            this.log.warn(`print/start local refusé: ${JSON.stringify(result)}`);
            throw new Error(
                `Démarrage refusé par l'imprimante (code ${result.code ?? '?'}): ${result.msg ?? JSON.stringify(result.data)}`,
            );
        }
        this.currentJobId = await this.gcode.startJob(this.config.id, filename, null);
        this.currentJobFilename = filename;
        this.s.filename = filename;
        this.publish();
    }

    private taskSettings(autoLeveling: boolean | undefined, excluded: string[]): PrintStartPayload['task_settings'] {
        return {
            auto_leveling: (autoLeveling ?? this.config.settings.autoLeveling) ? 1 : 0,
            vibration_compensation: this.config.settings.vibrationCompensation ? 1 : 0,
            flow_calibration: 0,
            dry_mode: 0,
            ai_settings: { status: 0, count: 0, type: 1 },
            timelapse: { status: 0, count: 0, type: 64 },
            drying_settings: { status: 0, target_temp: 0, duration: 0, remain_time: 0 },
            model_objects_skip_parts: excluded,
        };
    }

    private async startPrint(
        file: StoredFile,
        opts: { serveBase: string; autoLeveling?: boolean; excludedObjects?: string[] },
    ): Promise<void> {
        this.s.fileReady = '';
        const excluded = (opts.excludedObjects ?? []).filter((n) => file.objects.includes(n));
        this.s.skippedObjects = excluded;
        this.s.skipTs = Date.now();
        let loaded = this.loadedSlotsForPrint();

        const used = new Set(file.filaments.filter((f) => f.isUsed).map((f) => f.slotIndex));
        if (used.size) loaded = loaded.filter((s) => used.has(s.globalIndex));
        const mapping = buildAutoAmsBoxMapping(loaded, this.filamentMode);
        const url = `${opts.serveBase}/serve/${encodeURIComponent(file.filename)}`;
        const payload: PrintStartPayload = {
            taskid: '-1',
            url,
            filename: file.filename,
            md5: file.md5,
            filepath: null,
            filetype: 1,
            project_type: 1,
            filesize: file.sizeBytes,
            ams_settings: { use_ams: mapping.length > 0, ams_box_mapping: mapping },
            task_settings: this.taskSettings(opts.autoLeveling, excluded),
        };
        this.s.slicerTimeSec = file.estPrintTimeSec;
        this.s.thumbnail = file.thumbnail ?? '';
        this.layerHeight = file.layerHeight;
        this.firstLayerHeight = file.firstLayerHeight || file.layerHeight;
        this.log.log(`print/start → ${file.filename}  ams=${mapping.length} slots  mode=${this.filamentMode}`);
        const result = await this.client.startPrint(payload);
        if (!result) throw new Error("Pas de réponse de l'imprimante au démarrage de l'impression");
        if (result.state === 'failed' || (result.code !== undefined && result.code !== 0)) {
            throw new Error(`Démarrage refusé par l'imprimante: ${result.msg ?? JSON.stringify(result.data)}`);
        }
        this.currentJobId = await this.gcode.startJob(this.config.id, file.filename, file.id);
        this.currentJobFilename = file.filename;
        this.s.filename = file.filename;
        this.publish();
        if (excluded.length) void this.applyPreprintSkip(excluded);
    }
}

export class BridgeOfflineError extends Error {}

function mqttErrorMessage(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Not authorized|Bad username|code 4|code 5/i.test(msg)) {
        return "Identifiants MQTT refusés — ré-ajoutez l'imprimante pour rafraîchir les identifiants";
    }
    if (/ECONNREFUSED/.test(msg)) return "Port MQTT fermé — le mode LAN est-il activé sur l'imprimante ?";
    if (/ETIMEDOUT|EHOSTUNREACH/.test(msg)) return 'Imprimante injoignable sur le réseau';
    return msg;
}
