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
    type ConnectionError,
    type FilamentMode,
    KOBRA_TO_KLIPPER_STATE,
    type KobralinkEventType,
    PRE_PRINT_STATES,
    type PrinterFileDto,
    type PrinterLiveState,
    type PrinterSettings,
    type SpoolUsageEntry,
    TERMINAL_PRINT_STATES,
} from '@kobralink/shared';
import { Logger } from '@nestjs/common';
import type { GcodeService, StoredFile } from '../gcode/gcode.service';
import { connectionErrorMessage, m, protocolErrorMessage } from '../i18n/locale';
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

export interface BridgeDomainEvent {
    type: KobralinkEventType;
    data?: Record<string, string | number | boolean | null>;
}

export interface FilamentUsageSink {
    readonly name: string;
    slotMap(printerId: string): ReadonlyMap<number, string | number>;
    readonly syncRateSec: number;
    useFilament(spoolId: string | number, mm: number): Promise<void>;
}

export interface BridgeEvents {
    state: [state: PrinterLiveState];
    log: [line: string];
    event: [event: BridgeDomainEvent];
    layer: [layer: number, total: number];
    job: [phase: 'start' | 'end', jobId: string, filename: string];
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
        private readonly sinks: FilamentUsageSink[] = [],
    ) {
        super();
        this.log = new Logger(`Bridge:${config.name}`);
        this.camera = new CameraCache(this.log);
        this.s = {
            printerId: config.id,
            connected: false,
            connectionError: null,
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
            manualOffline: false,
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
            this.markOffline({ code: 'lost', ip: this.config.ip });
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
            this.markOffline({ code: 'reconnecting' });
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

    private markOffline(error: ConnectionError): void {
        const wasConnected = this.s.connected;
        this.offline = true;
        this.s.connected = false;
        if (wasConnected && error.code !== 'manual' && error.code !== 'reconnecting') {
            this.offlineSince = Date.now();
            this.emitEvent('printer_offline', { reason: error.code });
        }
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
            if (this.paused) {
                await this.sleep(probeInterval);
                continue;
            }
            if (this.offline) {
                if (!(await this.printerReachable())) {
                    this.checkAlerts();
                    await this.sleep(probeInterval);
                    continue;
                }
                try {
                    this.log.log('Printer reachable — opening MQTT session…');
                    await this.client.connect();
                    this.offline = false;
                    this.s.connected = true;
                    this.s.connectionError = null;
                    this.s.printState = 'standby';
                    this.s.kobraState = 'free';
                    this.offlineSince = 0;
                    this.offlineAlerted = false;
                    this.publish();
                    this.emitEvent('printer_online');
                } catch (e) {
                    const err = mqttConnectionError(e);
                    this.s.connectionError = err;
                    this.publish();
                    this.log.warn(`Connection failed: ${err.detail ?? err.code}`);
                    await this.sleep(probeInterval);
                    continue;
                }
            }

            try {
                const info = await this.client.queryInfo();
                if (info) {
                    this.onInfo(info);
                } else if (!this.client.connected) {
                    this.log.warn('MQTT session dead (no response) — going offline');
                    this.markOffline({ code: 'lost', ip: this.config.ip });
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
                this.log.warn(`Poll error: ${(e as Error).message}`);
                if (!(await this.printerReachable())) {
                    this.markOffline({ code: 'unreachable_ip', ip: this.config.ip });
                    await this.client.disconnect();
                }
            }
            this.checkAlerts();
            await this.sleep(this.pollIntervalMs());
        }
    }

    private offlineSince = 0;
    private offlineAlerted = false;
    private nozzleAlerted = false;
    private bedAlerted = false;

    emitEvent(type: KobralinkEventType, data?: BridgeDomainEvent['data']): void {
        this.emit('event', { type, data });
    }

    checkAlerts(): void {
        const a = this.config.settings.alerts;
        if (a.nozzleMaxC > 0) {
            if (this.s.nozzleTemp > a.nozzleMaxC && !this.nozzleAlerted) {
                this.nozzleAlerted = true;
                this.emitEvent('alert_nozzle_temp', { temp: Math.round(this.s.nozzleTemp), max: a.nozzleMaxC });
            } else if (this.s.nozzleTemp < a.nozzleMaxC - 10) this.nozzleAlerted = false;
        }
        if (a.bedMaxC > 0) {
            if (this.s.bedTemp > a.bedMaxC && !this.bedAlerted) {
                this.bedAlerted = true;
                this.emitEvent('alert_bed_temp', { temp: Math.round(this.s.bedTemp), max: a.bedMaxC });
            } else if (this.s.bedTemp < a.bedMaxC - 10) this.bedAlerted = false;
        }
        if (a.offlineMinutes > 0 && this.offlineSince && !this.offlineAlerted && !this.paused) {
            const minutes = (Date.now() - this.offlineSince) / 60_000;
            if (minutes >= a.offlineMinutes) {
                this.offlineAlerted = true;
                this.emitEvent('alert_offline', { minutes: Math.round(minutes) });
            }
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
                void this.client.startCamera().catch((e) => this.log.warn(`Camera autostart: ${String(e)}`));
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
        if (d.supplies_usage !== undefined) this.suppliesUsageMm = Number(d.supplies_usage) || 0;

        if (kobraState === 'pause' || kobraState === 'paused') {
            if (p.msg) {
                const changed = this.s.pauseMsg !== p.msg;
                this.s.errorCode = Number(p.code ?? 0);
                this.s.pauseMsg = p.msg;
                this.log.warn(`Printer paused: [${this.s.errorCode}] ${p.msg}`);
                if (changed)
                    this.emitEvent('print_paused', { code: this.s.errorCode, msg: p.msg, filename: this.s.filename });
            }
        } else if (['resuming', 'resumed', 'printing', 'finished', 'stoped', 'canceled'].includes(kobraState)) {
            this.s.errorCode = 0;
            this.s.pauseMsg = '';
        }

        if (kobraState === 'printing' && !this.currentJobId) {
            const filename = d.filename ?? this.s.filename;
            if (filename) void this.beginJob(filename);
            this.resetSpoolUsage();
        }

        if ((kobraState === 'finished' || kobraState === 'stoped' || kobraState === 'canceled') && this.currentJobId) {
            this.spoolmanReport(0.1);
        }
        if (kobraState === 'finished' && this.currentJobId) {
            this.endJob('completed');
            this.log.log(`Print finished: ${this.currentJobFilename}`);
            if (this.config.settings.deletePrinterFileAfterPrint && this.currentJobFilename) {
                const name = this.currentJobFilename;
                setTimeout(() => {
                    this.deletePrinterFiles([name])
                        .then(() => this.log.log(`File deleted from the printer: ${name}`))
                        .catch((e) => this.log.warn(`Unable to delete from the printer (${name}): ${e.message}`));
                }, 3000);
            }
            this.currentJobId = '';
            this.currentJobFilename = '';
        } else if ((kobraState === 'stoped' || kobraState === 'canceled') && this.currentJobId) {
            this.endJob('cancelled');
            this.log.log(`Print cancelled: ${this.currentJobFilename}`);
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
        if (d.curr_layer !== undefined) this.setLayer(Number(d.curr_layer));
        if (d.total_layers !== undefined) this.s.totalLayers = Number(d.total_layers);
        if (d.taskid !== undefined) this.s.taskId = String(d.taskid);
        if (d.settings?.print_speed_mode !== undefined) this.s.printSpeedMode = Number(d.settings.print_speed_mode);
        this.publish();
    }

    private setLayer(layer: number): void {
        const prev = this.s.currLayer;
        this.s.currLayer = layer;
        if (layer !== prev && layer > 0 && this.s.printState === 'printing')
            this.emit('layer', layer, this.s.totalLayers);
    }

    private endJob(status: 'completed' | 'cancelled' | 'error'): void {
        const jobId = this.currentJobId;
        const filename = this.currentJobFilename;
        if (!jobId) return;
        const usage = this.spoolUsageEntries();
        void this.gcode.finishJob(jobId, status, this.suppliesUsageMm, usage);
        this.emit('job', 'end', jobId, filename);
        this.emitEvent(status === 'completed' ? 'print_finished' : 'print_cancelled', {
            filename,
            durationSec: Math.round(this.s.printDurationSec),
            filamentMm: Math.round(this.suppliesUsageMm),
        });
    }

    private spoolUsageEntries(): SpoolUsageEntry[] {
        const out: SpoolUsageEntry[] = [];
        const local = this.sinks.find((x) => x.name === 'local')?.slotMap(this.config.id);
        const perSlot = new Map(this.spoolUsage);
        if (!perSlot.size && this.suppliesUsageMm > 0) {
            const slot = this.s.amsLoadedSlot >= 0 ? this.s.amsLoadedSlot : 0;
            perSlot.set(slot, this.suppliesUsageMm);
        }
        for (const [slotIndex, mm] of perSlot) {
            if (mm <= 0) continue;
            const spoolId = local?.get(slotIndex);
            out.push({
                slotIndex,
                mm: Math.round(mm),
                material: this.s.amsSlots.find((x) => x.globalIndex === slotIndex)?.type ?? '',
                spoolId: typeof spoolId === 'string' ? spoolId : null,
            });
        }
        return out;
    }

    private resetPrintFields(): void {
        this.suppliesUsageMm = 0;
        this.spoolUsage.clear();
        this.spoolReported.clear();
        this.spoolLastUsage = 0;
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
        this.log.log(`Job started: ${filename}`);
        this.emit('job', 'start', this.currentJobId, filename);
        this.emitEvent('print_started', { filename });
    }

    get jobId(): string {
        return this.currentJobId;
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
        if (project.curr_layer !== undefined) this.setLayer(Number(project.curr_layer));
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
                this.log.log(`URLs announced by the printer: ${JSON.stringify(d.urls)}`);
            }
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
            this.log.warn(`multiColorBox rejected by the printer: ${JSON.stringify(p.data)}`);
            return;
        }
        const boxes = p.data?.multi_color_box ?? [];
        if (!boxes.length) return;
        this.filamentMode = detectFilamentMode(boxes);
        this.s.filamentMode = this.filamentMode;
        const { slots, loaded } = aggregateSlots(boxes, this.filamentMode);
        const activity = slotActivityMap(boxes, loaded, this.filamentMode);
        for (const s of slots) s.activity = activity.get(s.globalIndex) ?? '';
        this.spoolmanAttribute(loaded, activity);

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
        const wasDrying = this.s.aceDrying.status !== 0 && this.s.aceDrying.remainTime <= 2;
        this.s.aceUnits = ace.units;
        this.s.aceDrying = ace.drying;
        if (wasDrying && ace.drying.status === 0) this.emitEvent('drying_done');
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

    private suppliesUsageMm = 0;
    private readonly spoolUsage = new Map<number, number>();
    private readonly spoolReported = new Map<string, Map<number, number>>();
    private spoolLastUsage = 0;
    private readonly spoolLastSync = new Map<string, number>();

    resetSpoolUsage(): void {
        this.spoolUsage.clear();
        this.spoolReported.clear();
        this.spoolLastUsage = this.suppliesUsageMm;
        this.spoolLastSync.clear();
    }

    private activeSinks(): FilamentUsageSink[] {
        return this.sinks.filter((x) => x.slotMap(this.config.id).size > 0);
    }

    private spoolmanAttribute(loaded: number, activity: Map<number, string>): void {
        if (this.s.printState !== 'printing') return;
        const current = this.suppliesUsageMm;
        const delta = current - this.spoolLastUsage;
        this.spoolLastUsage = current;
        if (delta <= 0 || loaded < 0) return;
        const act = activity.get(loaded);
        if (act === 'feeding' || act === 'retracting') return;
        this.spoolUsage.set(loaded, (this.spoolUsage.get(loaded) ?? 0) + delta);
        for (const sink of this.activeSinks()) {
            const rate = sink.syncRateSec;
            const last = this.spoolLastSync.get(sink.name) ?? 0;
            if (rate > 0 && Date.now() - last >= rate * 1000) {
                this.spoolLastSync.set(sink.name, Date.now());
                this.spoolmanReportTo(sink, 10);
            }
        }
    }

    private spoolmanUnreported(sink: FilamentUsageSink): Map<number, number> {
        const map = sink.slotMap(this.config.id);
        const reported = this.spoolReported.get(sink.name) ?? new Map<number, number>();
        const out = new Map<number, number>();
        if (this.spoolUsage.size) {
            for (const slot of map.keys()) {
                out.set(slot, (this.spoolUsage.get(slot) ?? 0) - (reported.get(slot) ?? 0));
            }
            return out;
        }
        if (map.size === 1) {
            const slot = [...map.keys()][0];
            out.set(slot, this.suppliesUsageMm - (reported.get(slot) ?? 0));
        }
        return out;
    }

    private spoolmanReport(minMm: number): void {
        for (const sink of this.activeSinks()) this.spoolmanReportTo(sink, minMm);
    }

    private spoolmanReportTo(sink: FilamentUsageSink, minMm: number): void {
        const map = sink.slotMap(this.config.id);
        let reported = this.spoolReported.get(sink.name);
        if (!reported) {
            reported = new Map();
            this.spoolReported.set(sink.name, reported);
        }
        for (const [slot, mm] of this.spoolmanUnreported(sink)) {
            const spoolId = map.get(slot);
            if (spoolId === undefined || mm < minMm) continue;
            reported.set(slot, (reported.get(slot) ?? 0) + mm);
            sink.useFilament(spoolId, mm)
                .then(() => this.log.log(`${sink.name}: ${mm.toFixed(1)} mm → spool ${spoolId} (slot ${slot + 1})`))
                .catch((e) => this.log.warn(`${sink.name}: report failed (spool ${spoolId}): ${(e as Error).message}`));
        }
    }

    private knownUrlKeys = '';
    private paused = false;

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
        if (res?.code !== 200) throw new BridgeRequestError(m.api_printer_no_file_list());
        return (res.data?.records ?? [])
            .filter((r) => !r.is_dir)
            .map((r) => ({ filename: r.filename, sizeBytes: Number(r.size ?? 0), timestamp: Number(r.timestamp ?? 0) }))
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    async deletePrinterFiles(filenames: string[]): Promise<void> {
        const res = await this.waitFileAction('deleteBatch', () => this.client.deleteLocalFiles(filenames));
        if (res?.state !== 'success') throw new BridgeRequestError(m.api_delete_refused());
        for (const f of filenames) this.printerThumbs.delete(f);
    }

    async printerFileThumbnail(filename: string): Promise<string> {
        const cached = this.printerThumbs.get(filename);
        if (cached !== undefined) return cached;
        const res = await this.waitFileAction('fileDetails', () => this.client.requestFileDetails(filename), 5000);
        if (!res) throw new BridgeRequestError(m.api_thumbnail_unavailable());
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
                this.log.warn(`Unable to update objects for ${fileName}: ${(e as Error).message}`);
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
        if (!res) throw new BridgeRequestError(m.api_skip_no_response());
        if (res.state === 'failed') throw new BridgeRequestError(m.api_skip_refused());
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
                    this.log.log(`Pre-print skip applied (${names.length} objects)`);
                    this.pendingPreprintSkip = [];
                    this.pendingPreprintDeadline = 0;
                    return;
                }
            }
            await this.sleep(750);
        }
        this.log.warn('Pre-print skip not confirmed');
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
        if (!this.client.connected) throw new BridgeOfflineError(connectionErrorMessage(this.s.connectionError));
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
        if (!ids.length) throw new BridgeOfflineError(m.api_no_ace());
        if (opts.aceId !== undefined) {
            if (!ids.includes(opts.aceId)) throw new BridgeOfflineError(m.api_ace_not_detected({ n: opts.aceId + 1 }));
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
        this.log.log(`Camera startCapture: state=${result?.state ?? 'timeout'}`);
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
        this.paused = false;
        await this.client.disconnect();
        this.markOffline({ code: 'reconnecting' });
        this.wakeLoop();
    }

    async disconnectManual(): Promise<void> {
        this.paused = true;
        this.camera.stop();
        await this.client.disconnect();
        this.markOffline({ code: 'manual' });
        this.s.manualOffline = true;
        this.publish();
        this.log.log('MQTT session closed manually');
    }

    connectManual(): void {
        if (!this.paused) return;
        this.paused = false;
        this.s.manualOffline = false;
        this.publish();
        this.wakeLoop();
        this.log.log('Manual reconnection requested');
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
            if (!url) throw new BridgeRequestError(m.api_no_upload_url());
            this.uploadUrl = url;
        }
        this.log.log(`Uploading to the printer: ${file.filename} (${data.length} B)`);
        const result = await uploadGcode(this.config.ip, this.uploadUrl, file.filename, data).catch((e) => {
            throw new Error(protocolErrorMessage(e));
        });
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
        if (!loaded) throw new BridgeRequestError(m.api_file_not_in_store());
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
        this.log.warn(`Default slot ${wanted} empty — falling back to auto`);
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
        this.log.log(`print/start (printer file) → ${filename}  ams=${mapping.length} slots`);
        const result = await this.client.startPrint(payload);
        if (!result) throw new BridgeRequestError(m.api_print_no_response());
        if (result.state === 'failed' || (result.code !== undefined && result.code !== 0)) {
            this.log.warn(`local print/start refused: ${JSON.stringify(result)}`);
            throw new Error(
                m.api_print_refused_code({ code: result.code ?? '?', msg: result.msg ?? JSON.stringify(result.data) }),
            );
        }
        this.currentJobId = await this.gcode.startJob(this.config.id, filename, null);
        this.currentJobFilename = filename;
        this.s.filename = filename;
        this.publish();
        this.emit('job', 'start', this.currentJobId, filename);
        this.emitEvent('print_started', { filename });
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
        if (!result) throw new BridgeRequestError(m.api_print_no_response());
        if (result.state === 'failed' || (result.code !== undefined && result.code !== 0)) {
            throw new BridgeRequestError(m.api_print_refused({ msg: result.msg ?? JSON.stringify(result.data) }));
        }
        this.currentJobId = await this.gcode.startJob(this.config.id, file.filename, file.id);
        this.currentJobFilename = file.filename;
        this.s.filename = file.filename;
        this.publish();
        this.emit('job', 'start', this.currentJobId, file.filename);
        this.emitEvent('print_started', { filename: file.filename });
        if (excluded.length) void this.applyPreprintSkip(excluded);
    }
}

export class BridgeOfflineError extends Error {}

export class BridgeRequestError extends Error {}

function mqttConnectionError(e: unknown): ConnectionError {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Not authorized|Bad username|code 4|code 5/i.test(msg)) return { code: 'mqtt_auth', detail: msg };
    if (/ECONNREFUSED/.test(msg)) return { code: 'mqtt_refused', detail: msg };
    if (/ETIMEDOUT|EHOSTUNREACH/.test(msg)) return { code: 'unreachable', detail: msg };
    return { code: 'other', detail: msg };
}
