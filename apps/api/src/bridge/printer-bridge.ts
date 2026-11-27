import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import {
    type KobraAxisData,
    type KobraFanData,
    type KobraFileData,
    type KobraFileRecord,
    type KobraInfoData,
    type KobraLightData,
    type KobraMessage,
    KobraMqttClient,
    type KobraMultiColorBoxData,
    type KobraPeripheralsData,
    type KobraPrintData,
    type KobraSkipData,
    type PrintStartPayload,
    readLight,
    redactPrinterUrl,
    uploadGcode,
} from '@kobralink/kobra-protocol';
import {
    ACE_DRYING_FAULT,
    ACE_DRYING_ON,
    ACTIVE_PRINT_STATES,
    type AmsSlot,
    type ConnectionError,
    type FailureReason,
    type FilamentAssignment,
    type FilamentMode,
    isPreparing,
    KOBRA_TO_KLIPPER_STATE,
    type KobralinkEventType,
    POSITION_POLL_MS,
    PRINTER_FILE_LIST_LIMIT,
    type PrinterFileDto,
    type PrinterFileListDto,
    type PrinterLiveState,
    type PrinterSample,
    type PrinterSettings,
    type PrintOption,
    readFeatures,
    readPeripherals,
    type SpoolmanPricing,
    type SpoolUsageEntry,
    slotUsableForPrint,
    splitPrinterFilePath,
    supportsPrintOption,
    TERMINAL_PRINT_STATES,
    TEST_MODEL_FOLDER,
} from '@kobralink/shared';
import { Logger } from '@nestjs/common';
import type { GcodeService, StoredFile } from '../gcode/gcode.service';
import { connectionErrorMessage, m, printerRefusedMessage, protocolErrorMessage } from '../i18n/locale';
import { bindPrinterContext } from '../logs/log-buffer';
import {
    aggregateAceUnits,
    aggregateSlots,
    buildAssignedAmsBoxMapping,
    buildAutoAmsBoxMapping,
    detectFilamentMode,
    EMPTY_DRYING,
    globalToBoxSlot,
    printSlotsFromMapping,
    slotActivityMap,
} from './ams';
import { CameraCache } from './camera';

const MAX_SAMPLES = 120;
const SAMPLE_INTERVAL_MS = 2000;
const PRINT_HOLD_MS = 60000;
const SNAPSHOT_MAX_AGE_MS = 120000;
const CAMERA_STALE_MS = 30000;
const CAMERA_FRESH_MS = 5000;
const CAMERA_KICK_INTERVAL_MS = 60000;
const LIGHT_TRIGGER_WINDOW_MS = 20_000;
const LIGHT_TRIGGER_TAPS = 3;
const LIGHT_OWN_COMMAND_MS = 5_000;
const IDLE_CONFIRM_MS = 10_000;
const PAUSE_KOBRA_STATES = new Set(['pausing', 'paused', 'pause']);
const RESUME_KOBRA_STATES = new Set(['resuming', 'resumed', 'printing']);

const AXIS_MAX_MISSES = 5;

export interface BridgePrinterConfig {
    id: string;
    name: string;
    ip: string;
    mqttPort: number;
    username: string;
    password: string;
    deviceId: string;
    modeId: string;
    model: string;
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
    useFilament(spoolId: string | number, mm: number, printerId: string): Promise<void>;
    describe?(spoolId: string | number): Promise<SpoolmanPricing | null>;
}

export interface CommandRefused {
    printerId: string;
    printerName: string;
    topic: string;
    action: string;
    code: number | string;
    msg: string;
}

export interface BridgeEvents {
    state: [state: PrinterLiveState];
    refused: [refused: CommandRefused];
    log: [line: string];
    event: [event: BridgeDomainEvent];
    layer: [layer: number, total: number];
    job: [phase: 'start' | 'end', jobId: string, filename: string, status: JobEndStatus | null];
    light_trigger: [];
    interrupted: [];
}

interface LastUpload {
    filename: string;
    url: string;
    md5: string;
    size: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf: Buffer): boolean {
    return buf.length >= 24 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

export function moonrakerThumbnails(filename: string, b64: string) {
    const png = Buffer.from(b64, 'base64');
    if (!isPng(png)) return [];
    return [
        {
            width: png.readUInt32BE(16),
            height: png.readUInt32BE(20),
            size: png.length,
            relative_path: `.thumbs/${Buffer.from(filename).toString('base64url')}.png`,
        },
    ];
}

export class PrinterBridge extends EventEmitter<BridgeEvents> {
    client: KobraMqttClient;
    private readonly log: Logger;
    readonly camera: CameraCache;
    private readonly s: PrinterLiveState;
    private readonly history: PrinterSample[] = [];

    private running = false;
    private offline = true;
    private loopWake: (() => void) | null = null;
    private loopDone: Promise<void> | null = null;
    private positionTimer: NodeJS.Timeout | null = null;
    private axisMisses = 0;

    private filamentMode: FilamentMode = 'toolhead';
    private reportedModel = '';
    private currentJobId = '';
    private currentJobFilename = '';
    private jobPausedAt: Date | null = null;
    private cancelReason: FailureReason | '' = '';
    private readonly unknownStates = new Set<string>();
    private jobPrinted = false;
    private lightTaps: number[] = [];
    private lastOwnLightAt = 0;
    private jobSync: Promise<void> | null = null;
    private jobsReconciled = false;
    private jobActive = false;
    private freeSince = 0;
    private reportedFailure: { code: number; msg: string } | null = null;
    private peakPrintTimeSec = 0;
    private lastUpload: LastUpload | null = null;
    private printHold: { fileId: string; until: number } | null = null;
    private layerHeight = 0;
    private firstLayerHeight = 0;
    private cameraAutostarted = false;
    private cameraUserStopped = false;
    private cameraKickAt = 0;
    private jobOptions: { timelapse?: boolean; failureDetection?: boolean } = {};
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
        bindPrinterContext(`Bridge:${config.name}`, config.id);
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
            printTimeAt: 0,
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
            fileReadyTs: 0,
            errorCode: 0,
            pauseMsg: '',
            filamentMode: 'toolhead',
            amsSlots: [],
            amsLoadedSlot: -1,
            externalSpoolOnly: false,
            aceUnits: [],
            aceDrying: EMPTY_DRYING,
            skippedObjects: [],
            skipTs: 0,
            position: null,
            printSlots: null,
            manualOffline: false,
            storageTotalMb: 0,
            storageUsedMb: 0,
            features: null,
            peripherals: null,
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
            clientId: `kobralink-${process.pid}-${randomBytes(3).toString('hex')}`,
            logger: {
                debug: (m) => this.log.debug(m),
                info: (m) => this.log.log(m),
                warn: (m) => this.log.warn(m),
                error: (m) => this.log.error(m),
            },
        });
        client.on('report', (suffix, payload) => {
            try {
                this.onReport(suffix, payload);
            } catch (e) {
                this.log.warn(`Unreadable ${suffix} message ignored: ${(e as Error).message}`);
            }
        });
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

    get timelapseForJob(): boolean {
        return this.jobOptions.timelapse ?? this.config.settings.timelapseEnabled;
    }

    get failureDetectionForJob(): boolean {
        return this.jobOptions.failureDetection ?? this.config.settings.failureDetection;
    }

    snapshot(): PrinterLiveState {
        return { ...this.s, amsSlots: this.s.amsSlots.map((x) => ({ ...x })) };
    }

    samples(): PrinterSample[] {
        return this.history.slice();
    }

    private recordSample(): void {
        const last = this.history[this.history.length - 1];
        if (last && this.s.updatedAt - last.t < SAMPLE_INTERVAL_MS) return;
        this.history.push({
            t: this.s.updatedAt,
            nozzle: this.s.nozzleTemp,
            bed: this.s.bedTemp,
            progress: this.s.progress,
        });
        if (this.history.length > MAX_SAMPLES) this.history.splice(0, this.history.length - MAX_SAMPLES);
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.offline = true;
        this.loopDone = this.pollLoop();
        this.positionTimer = setInterval(() => this.pollPosition(), POSITION_POLL_MS);
    }

    async stop(): Promise<void> {
        this.running = false;
        this.wakeLoop();
        if (this.positionTimer) clearInterval(this.positionTimer);
        this.positionTimer = null;
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
        if (reconnect) {
            const old = this.client;
            this.client = this.createClient();
            await old.disconnect();
        }
        if (reconnect && this.running) {
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
        this.camera.keepAlive = false;
        this.camera.stop();
        this.offline = true;
        this.jobsReconciled = false;
        this.freeSince = 0;
        this.loggedFeatures = '';
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
            sock.on('error', () => finish(false));
        });
    }

    private async pollLoop(): Promise<void> {
        const probeInterval = 10000;
        let connectFailure = '';
        while (this.running) {
            if (this.paused) {
                await this.sleep(probeInterval);
                continue;
            }
            if (this.offline) {
                if (!(await this.printerReachable())) {
                    if (this.offline && this.s.connectionError?.code === 'reconnecting') {
                        this.s.connectionError = { code: 'unreachable_ip', ip: this.config.ip };
                        this.publish();
                    }
                    this.checkAlerts();
                    await this.sleep(probeInterval);
                    continue;
                }
                try {
                    if (!connectFailure) this.log.log('Printer reachable — opening MQTT session…');
                    await this.client.connect();
                    connectFailure = '';
                    this.offline = false;
                    this.s.connected = true;
                    this.s.connectionError = null;
                    this.s.printState = 'standby';
                    this.offlineSince = 0;
                    this.offlineAlerted = false;
                    this.publish();
                    this.emitEvent('printer_online');
                    this.lastOwnLightAt = Date.now();
                    this.client.queryLight();
                    this.client.queryPeripherals();
                } catch (e) {
                    const err = mqttConnectionError(e);
                    this.s.connectionError = err;
                    this.publish();
                    const failure = err.detail ?? err.code;
                    if (failure !== connectFailure) this.log.warn(`Connection failed: ${failure}`);
                    connectFailure = failure;
                    this.checkAlerts();
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
                    const asked = Date.now();
                    const pr = await this.client.queryPrint();
                    this.logPrintQuery(pr ? Date.now() - asked : null);
                    if (pr) this.onPrint(pr);
                }
                const box = await this.client.queryMultiColorBox();
                if (box) this.onMultiColorBox(box);
                this.maintainCamera();
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
        this.s.zMm = this.s.position?.z ?? this.estimateZ();
        this.recordSample();
        this.emit('state', this.snapshot());
    }

    private onReport(suffix: string, payload: KobraMessage): void {
        const positionPoll = suffix === 'axis/report' && payload.action === 'query';
        if (payload.state === 'failed' && !positionPoll) {
            this.log.warn(
                `${suffix} failed: action=${payload.action} code=${payload.code ?? '?'} msg=${payload.msg ?? ''}`,
            );
            if (!(suffix === 'axis/report' && payload.action === 'move')) {
                this.emit('refused', {
                    printerId: this.config.id,
                    printerName: this.config.name,
                    topic: suffix.replace('/report', ''),
                    action: payload.action ?? '',
                    code: payload.code ?? '?',
                    msg: payload.msg ?? '',
                });
            }
        }
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
            case 'fan/report':
                this.onFan(payload as KobraMessage<KobraFanData>);
                break;
            case 'light/report':
                this.onLight(payload as KobraMessage<KobraLightData>);
                break;
            case 'peripherie/report':
                this.onPeripherals(payload as KobraMessage<KobraPeripheralsData>);
                break;
            case 'file/report':
                this.onFile(payload as KobraMessage<KobraFileData>);
                break;
            case 'skip/report':
                this.onSkip(payload as KobraMessage<KobraSkipData>);
                break;
            case 'axis/report':
                this.onAxis(payload as KobraMessage<KobraAxisData>);
                break;
            case 'buried/report':
                this.onBuried(payload as KobraMessage<Record<string, unknown>>);
                break;
            default:
                break;
        }
    }

    private pollPosition(): void {
        if (!this.offline && this.s.printState === 'printing') {
            if (this.axisMisses >= AXIS_MAX_MISSES) return;
            void this.client.queryAxis().then((r) => {
                this.axisMisses = r && r.state !== 'failed' ? 0 : this.axisMisses + 1;
            });
            return;
        }
        if (this.s.printState === 'paused') return;
        this.axisMisses = 0;
        if (this.s.position) {
            this.s.position = null;
            this.publish();
        }
    }

    private onAxis(p: KobraMessage<KobraAxisData>): void {
        if (p.action !== 'query' || p.state === 'failed' || this.s.printState !== 'printing') return;
        const { x, y, z } = p.data ?? {};
        if (![x, y, z].every(Number.isFinite)) return;
        const mm = (v: unknown) => Math.round((v as number) * 1000) / 1000;
        this.s.position = { x: mm(x), y: mm(y), z: mm(z) };
        this.publish();
    }

    private onTemp(p: KobraMessage<Partial<Record<string, number>>>): void {
        if (p.state === 'failed') return;
        this.readTemp(p.data ?? {});
        this.publish();
    }

    private readTemp(d: Partial<Record<string, number>>): void {
        const read = (value: unknown, current: number) => {
            const n = Number(value ?? Number.NaN);
            return Number.isFinite(n) ? n : current;
        };
        this.s.nozzleTemp = read(d.curr_nozzle_temp, this.s.nozzleTemp);
        this.s.nozzleTarget = read(d.target_nozzle_temp, this.s.nozzleTarget);
        this.s.bedTemp = read(d.curr_hotbed_temp, this.s.bedTemp);
        this.s.bedTarget = read(d.target_hotbed_temp, this.s.bedTarget);
    }

    private applyKobraState(kobraState: string, fallback: 'printing' | 'standby'): void {
        const known = KOBRA_TO_KLIPPER_STATE[kobraState];
        if (!known && !this.unknownStates.has(kobraState)) {
            this.unknownStates.add(kobraState);
            this.log.warn(`Unknown Kobra state "${kobraState}", keeping the print state`);
        }
        this.s.printState = known ?? (this.s.kobraState === 'offline' ? fallback : this.s.printState);
        this.s.kobraState = kobraState;
        this.trackPause(kobraState);
        if (kobraState === 'printing') {
            if (this.config.settings.cameraOnPrint && !this.cameraAutostarted && !this.cameraUserStopped) {
                this.cameraAutostarted = true;
                void this.client.startCamera().catch((e) => this.log.warn(`Camera autostart: ${String(e)}`));
            }
        } else if (kobraState === 'free' || TERMINAL_PRINT_STATES.has(kobraState)) {
            this.cameraAutostarted = false;
            if (!this.config.settings.cameraAlwaysOn) this.cameraUserStopped = false;
        }
    }

    private trackPause(kobraState: string): void {
        if (!this.currentJobId) return;
        if (PAUSE_KOBRA_STATES.has(kobraState)) {
            if (this.jobPausedAt) return;
            this.jobPausedAt = new Date();
        } else if (RESUME_KOBRA_STATES.has(kobraState)) {
            if (!this.jobPausedAt) return;
            this.jobPausedAt = null;
        } else return;
        void this.gcode
            .setJobPaused(this.currentJobId, this.jobPausedAt)
            .catch((e) => this.log.warn(`Job pause: ${(e as Error).message}`));
    }

    private onPrint(p: KobraMessage<KobraPrintData>): void {
        const d = p.data ?? {};
        if (p.state === 'failed') {
            if (d.filename) this.reportedFailure = { code: Number(p.code) || 0, msg: p.msg ?? '' };
            return;
        }
        const acknowledgement = p.state === 'updated';
        if (acknowledgement) {
            this.logUpdated(d);
            if (this.s.printState !== 'printing' && this.s.printState !== 'paused') return;
        }
        const kobraState = acknowledgement ? this.s.kobraState : (p.state ?? '');
        if (d.supplies_usage !== undefined) {
            this.suppliesUsageMm = Number(d.supplies_usage) || 0;
            if (this.s.externalSpoolOnly) this.spoolmanAttribute(0, new Map());
        }
        if (kobraState && !acknowledgement) this.applyKobraState(kobraState, 'printing');

        if (!acknowledgement && (kobraState === 'pause' || kobraState === 'paused')) {
            const code = Number(p.code) || 0;
            if (p.msg && (this.s.pauseMsg !== p.msg || this.s.errorCode !== code)) {
                this.s.errorCode = code;
                this.s.pauseMsg = p.msg;
                this.log.warn(`Printer paused: [${code}] ${p.msg}`);
                this.emitEvent('print_paused', { code, msg: p.msg, filename: this.s.filename });
            }
        } else if (['resuming', 'resumed', 'printing'].includes(kobraState)) {
            this.s.errorCode = 0;
            this.s.pauseMsg = '';
        }

        if (d.print_time !== undefined) this.setPrintTime(Number(d.print_time) * 60);
        this.syncJob(kobraState, d.filename ?? this.s.filename);

        if (TERMINAL_PRINT_STATES.has(kobraState)) {
            this.resetPrintFields();
        } else {
            this.s.filename = d.filename ?? this.s.filename;
        }
        if (d.curr_layer !== undefined) this.setLayer(Number(d.curr_layer));
        if (isPreparing(kobraState, this.s.currLayer)) this.s.progress = 0;
        else if (d.progress !== undefined) this.s.progress = Number(d.progress) / 100;
        if (d.remain_time !== undefined) this.s.remainTimeSec = Number(d.remain_time) * 60;
        if (d.total_layers !== undefined) this.s.totalLayers = Number(d.total_layers);
        if (d.taskid !== undefined) this.s.taskId = String(d.taskid);
        if (d.settings?.print_speed_mode !== undefined) this.s.printSpeedMode = Number(d.settings.print_speed_mode);
        const fan = Number(d.settings?.fan_speed_pct);
        if (d.settings?.fan_speed_pct !== undefined && Number.isFinite(fan)) this.s.fanSpeed = fan;
        this.publish();
    }

    private setPrintTime(sec: number): void {
        if (sec > 0 && this.currentJobId) this.jobPrinted = true;
        if (sec > this.peakPrintTimeSec) this.peakPrintTimeSec = sec;
        if (sec === this.s.printDurationSec && this.s.printTimeAt) return;
        this.s.printDurationSec = sec;
        this.s.printTimeAt = Date.now();
    }

    private setLayer(layer: number): void {
        if (layer > 0 && this.currentJobId) this.jobPrinted = true;
        const prev = this.s.currLayer;
        this.s.currLayer = layer;
        if (layer !== prev && layer > 0 && this.s.printState === 'printing')
            this.emit('layer', layer, this.s.totalLayers);
    }

    private syncJob(kobraState: string, filename: string): void {
        if (!this.s.connected) return;
        const paused = PAUSE_KOBRA_STATES.has(kobraState);
        if (paused || ACTIVE_PRINT_STATES.has(kobraState)) {
            this.jobActive = true;
            this.reportedFailure = null;
            if (kobraState === 'printing' && this.freeSince && filename && filename !== this.currentJobFilename) {
                this.abandonJob();
                this.s.filename = filename;
                this.jobActive = true;
            }
            this.freeSince = 0;
        }
        if (paused || kobraState === 'printing') {
            this.jobsReconciled = true;
            if (this.currentJobId || this.jobSync || !filename) return;
            this.jobSync = this.beginJob(filename)
                .catch((e) => this.log.warn(`Job start: ${(e as Error).message}`))
                .finally(() => {
                    this.jobSync = null;
                });
            return;
        }
        const terminal = TERMINAL_PRINT_STATES.has(kobraState);
        const failed = kobraState === 'failed';
        if (!terminal && !failed && kobraState !== 'free') return;
        if (this.currentJobId) {
            if (terminal) this.spoolmanReport(0.1);
            if (kobraState === 'finished') {
                const name = this.currentJobFilename;
                this.endJob('completed');
                this.log.log(`Print finished: ${name}`);
                if (this.config.settings.deletePrinterFileAfterPrint && name) {
                    setTimeout(() => {
                        this.deletePrinterFiles([name])
                            .then(() => this.log.log(`File deleted from the printer: ${name}`))
                            .catch((e) => this.log.warn(`Unable to delete from the printer (${name}): ${e.message}`));
                    }, 3000);
                }
            } else if (terminal) {
                this.log.log(`Print cancelled: ${this.currentJobFilename}`);
                this.endJob('cancelled');
            } else if (failed) {
                this.abandonJob();
            } else if (!this.jobsReconciled) {
                this.log.warn(`Printer idle after reconnection, job closed as error: ${this.currentJobFilename}`);
                this.abandonJob();
            } else if (this.jobActive) {
                this.freeSince ||= Date.now();
                if (Date.now() - this.freeSince >= IDLE_CONFIRM_MS) this.abandonJob();
            }
            this.jobsReconciled = true;
            return;
        }
        if (this.jobsReconciled || this.jobSync) return;
        this.jobsReconciled = true;
        const status = kobraState === 'finished' ? 'completed' : terminal ? 'cancelled' : 'error';
        this.jobSync = this.gcode
            .closeOpenJobs(this.config.id, status)
            .then((n) => {
                if (!n) return;
                this.log.warn(`${n} job(s) left open while Kobralink was offline closed as ${status}`);
                if (status !== 'completed') this.emit('interrupted');
            })
            .catch((e) => this.log.warn(`Job reconcile: ${(e as Error).message}`))
            .finally(() => {
                this.jobSync = null;
            });
    }

    private abandonJob(): void {
        if (!this.currentJobId) return;
        this.log.warn(`Print ended without a final report, job closed as error: ${this.currentJobFilename}`);
        if (this.reportedFailure) {
            this.s.errorCode = this.reportedFailure.code;
            this.s.pauseMsg = this.reportedFailure.msg;
        }
        this.spoolmanReport(0.1);
        this.endJob('error');
        this.resetPrintFields();
    }

    private endJob(status: 'completed' | 'cancelled' | 'error'): void {
        const jobId = this.currentJobId;
        const filename = this.currentJobFilename;
        if (!jobId) return;
        this.currentJobId = '';
        this.currentJobFilename = '';
        this.jobActive = false;
        this.freeSince = 0;
        this.reportedFailure = null;
        const usage = this.spoolUsageEntries();
        const printedSec = Math.round(Math.max(this.s.printDurationSec, this.peakPrintTimeSec));
        const durationSec = this.jobPrinted ? printedSec : 0;
        const reportedSec = this.jobPrinted ? printedSec || null : 0;
        this.jobPrinted = false;
        const snapshot =
            status !== 'completed' &&
            this.camera.latestJpeg &&
            Date.now() - this.camera.latestJpegAt < SNAPSHOT_MAX_AGE_MS
                ? this.camera.latestJpeg
                : null;
        const pausedAt = this.jobPausedAt;
        this.jobPausedAt = null;
        const failureReason = status === 'completed' ? '' : this.cancelReason;
        this.cancelReason = '';
        const failure = { errorCode: this.s.errorCode, errorMsg: this.s.pauseMsg, snapshot, pausedAt, failureReason };
        const filamentMm = this.suppliesUsageMm;
        void this.priceUsage(usage)
            .then((priced) => this.gcode.finishJob(jobId, status, filamentMm, priced, reportedSec, failure))
            .catch((e) => this.log.warn(`Job finish: ${(e as Error).message}`));
        this.emit('job', 'end', jobId, filename, status);
        this.jobOptions = {};
        this.emitEvent(status === 'completed' ? 'print_finished' : 'print_cancelled', {
            filename,
            durationSec,
            filamentMm: Math.round(this.suppliesUsageMm),
        });
    }

    private async priceUsage(entries: SpoolUsageEntry[]): Promise<SpoolUsageEntry[]> {
        const sink = this.sinks.find((x) => x.name === 'spoolman');
        if (!sink?.describe) return entries;
        return Promise.all(
            entries.map(async (entry) => {
                if (!entry.spoolmanId) return entry;
                const pricing = await sink.describe?.(entry.spoolmanId).catch(() => null);
                if (!pricing) return entry;
                return {
                    ...entry,
                    weightG: Math.round(entry.mm * pricing.gramsPerMm * 100) / 100,
                    pricePerG: pricing.pricePerG,
                };
            }),
        );
    }

    private spoolUsageEntries(): SpoolUsageEntry[] {
        const out: SpoolUsageEntry[] = [];
        const local = this.sinks.find((x) => x.name === 'local')?.slotMap(this.config.id);
        const spoolman = this.sinks.find((x) => x.name === 'spoolman')?.slotMap(this.config.id);
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
                spoolmanId: (spoolman?.get(slotIndex) as number | undefined) ?? null,
            });
        }
        return out;
    }

    private clearFileReadyOf(filename: string | undefined): void {
        if (filename && this.s.fileReady === filename) this.s.fileReady = '';
    }

    private resetPrintFields(): void {
        this.s.errorCode = 0;
        this.s.pauseMsg = '';
        this.s.skippedObjects = [];
        this.s.skipTs = Date.now();
        this.suppliesUsageMm = 0;
        this.spoolUsage.clear();
        this.spoolReported.clear();
        this.spoolLastUsage = 0;
        this.spoolBaselineMm = 0;
        this.s.progress = 0;
        this.clearFileReadyOf(this.s.filename);
        this.s.filename = '';
        this.s.printDurationSec = 0;
        this.peakPrintTimeSec = 0;
        this.s.remainTimeSec = 0;
        this.s.printTimeAt = 0;
        this.s.slicerTimeSec = 0;
        this.s.currLayer = 0;
        this.s.totalLayers = 0;
        this.s.thumbnail = '';
        this.layerHeight = 0;
        this.firstLayerHeight = 0;
    }

    private async beginJob(filename: string, known?: StoredFile | null): Promise<void> {
        if (this.currentJobId) return;
        const file = known === undefined ? await this.gcode.getByFilename(filename) : known;
        if (file) this.adoptFileMeta(file);
        if (known === undefined) {
            const open = await this.gcode.findOpenJob(this.config.id);
            if (open && open.filename === filename) {
                this.currentJobId = open.id;
                this.currentJobFilename = filename;
                const paused = this.s.printState === 'paused';
                this.jobPausedAt = paused ? open.pausedAt : null;
                this.jobPrinted = this.s.currLayer > 0 || this.s.printDurationSec > 0;
                this.restoreUsage(open.usageState);
                if (open.pausedAt && !paused)
                    void this.gcode
                        .setJobPaused(open.id, null)
                        .catch((e) => this.log.warn(`Job pause: ${(e as Error).message}`));
                this.log.log(`Job resumed after reconnection: ${filename}`);
                return;
            }
        }
        const elapsed = known === undefined ? Math.round(Math.max(this.s.printDurationSec, this.peakPrintTimeSec)) : 0;
        this.currentJobId = await this.gcode.startJob(
            this.config.id,
            filename,
            file?.id ?? null,
            this.s.slicerTimeSec || file?.estPrintTimeSec || 0,
            elapsed > 0 ? new Date(Date.now() - elapsed * 1000) : undefined,
        );
        this.cancelReason = '';
        this.currentJobFilename = filename;
        this.jobPausedAt = null;
        this.jobPrinted = this.s.currLayer > 0 || this.s.printDurationSec > 0;
        this.log.log(`Job started: ${filename}`);
        this.emit('job', 'start', this.currentJobId, filename, null);
        this.emitEvent('print_started', { filename });
    }

    get jobId(): string {
        return this.currentJobId;
    }

    get modelName(): string {
        return (this.reportedModel || this.config.model || 'Anycubic Kobra').replace(/^Anycubic\s+/i, '');
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
        if (d.model) this.reportedModel = String(d.model);

        const project = d.project ?? {};
        const kobraState = project.state || d.state || '';
        if (kobraState) {
            this.applyKobraState(kobraState, 'standby');
            if (TERMINAL_PRINT_STATES.has(kobraState)) {
                this.clearFileReadyOf(project.filename || this.s.filename);
                this.s.currLayer = 0;
                this.s.totalLayers = 0;
            }
        }
        if (project.filename !== undefined && !TERMINAL_PRINT_STATES.has(kobraState))
            this.s.filename = project.filename;
        if (project.curr_layer !== undefined) this.setLayer(Number(project.curr_layer));
        if (project.progress !== undefined && !isPreparing(kobraState, this.s.currLayer)) {
            this.s.progress = Number(project.progress) / 100;
        }
        if (project.print_time !== undefined) this.setPrintTime(Number(project.print_time) * 60);
        if (project.remain_time !== undefined) this.s.remainTimeSec = Number(project.remain_time) * 60;
        if (project.total_layers !== undefined) this.s.totalLayers = Number(project.total_layers);
        if (project.taskid !== undefined) this.s.taskId = String(project.taskid);
        if (d.temp) this.readTemp({ ...d.temp });
        if (d.urls) {
            const keys = Object.keys(d.urls).sort().join(',');
            if (keys !== this.knownUrlKeys) {
                this.knownUrlKeys = keys;
                const shown = Object.fromEntries(
                    Object.entries(d.urls).map(([k, v]) => [k, typeof v === 'string' ? redactPrinterUrl(v) : v]),
                );
                this.log.log(`URLs announced by the printer: ${JSON.stringify(shown)}`);
            }
        }
        if (d.urls?.fileUploadurl) this.uploadUrl = d.urls.fileUploadurl;
        if (d.urls?.rtspUrl) {
            this.s.cameraUrl = d.urls.rtspUrl;
            this.camera.setUrl(d.urls.rtspUrl);
        }
        if (d.fan_speed_pct !== undefined) this.s.fanSpeed = Number(d.fan_speed_pct);
        this.logExtraFans(d);
        const features = readFeatures(d.features);
        if (features && d.features) {
            this.s.features = features;
            this.logFeatures(d.features);
        }
        if (d.print_speed_mode !== undefined) this.s.printSpeedMode = Number(d.print_speed_mode);
        if (kobraState) this.syncJob(kobraState, this.s.filename);
        this.publish();
    }

    private uploadUrl = '';

    private onMultiColorBox(p: KobraMessage<KobraMultiColorBoxData>): void {
        if (p.state === 'failed') {
            this.log.warn(`multiColorBox rejected by the printer: ${JSON.stringify(p.data)}`);
            return;
        }
        const boxes = p.data?.multi_color_box ?? [];
        const externalOnly = boxes.length === 0;
        if (this.s.externalSpoolOnly !== externalOnly) {
            this.s.externalSpoolOnly = externalOnly;
            this.publish();
        }
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
        const wasDrying = this.s.aceDrying.status === ACE_DRYING_ON && this.s.aceDrying.remainTime <= 2;
        const wasFault = this.s.aceDrying.status === ACE_DRYING_FAULT;
        this.s.aceUnits = ace.units;
        this.s.aceDrying = ace.drying;
        if (wasDrying && ace.drying.status === 0) this.emitEvent('drying_done');
        if (!wasFault && ace.drying.status === ACE_DRYING_FAULT) this.log.warn('The ACE reports a drying fault');
        if (slots.length) {
            this.s.amsSlots = slots;
            this.s.amsLoadedSlot = loaded;
        }
        this.publish();
    }

    private onLight(p: KobraMessage<KobraLightData>): void {
        if (p.action !== 'query') this.countLightTap(Date.now(), p);
        const light = readLight(p.data);
        if (!light) return;
        this.s.lightOn = light.on;
        this.s.lightBrightness = light.brightness;
        this.publish();
    }

    private onFan(p: KobraMessage<KobraFanData>): void {
        const raw = p.data?.fan_speed_pct;
        const pct = Number(raw);
        if (raw === undefined || raw === null || !Number.isFinite(pct)) return;
        this.s.fanSpeed = pct;
        this.publish();
    }

    private logExtraFans(d: KobraInfoData): void {
        const fans = Object.fromEntries(
            ['aux_fan_speed_pct', 'box_fan_level'].filter((k) => d[k] !== undefined).map((k) => [k, d[k]]),
        );
        const text = JSON.stringify(fans);
        if (text === '{}' || text === this.loggedFans) return;
        this.loggedFans = text;
        this.log.log(`Extra fans reported by the printer: ${text}`);
    }

    private logPrintQuery(ms: number | null): void {
        const key = this.s.filename;
        if (!key || key === this.printQueryLoggedFor) return;
        this.printQueryLoggedFor = key;
        this.log.log(
            ms === null
                ? 'print/query while printing: no print report within 3 s'
                : `print/query while printing: a print report came back after ${ms} ms`,
        );
    }

    private logUpdated(d: KobraPrintData): void {
        const keys = Object.keys(d).sort();
        const shape = JSON.stringify({ settings: Object.keys(d.settings ?? {}).sort(), keys });
        if (shape === this.loggedUpdated) return;
        this.loggedUpdated = shape;
        const text = JSON.stringify({ settings: d.settings ?? null, keys });
        this.log.log(`Print settings acknowledged by the printer (updated): ${text}`);
    }

    private onPeripherals(p: KobraMessage<KobraPeripheralsData>): void {
        const peripherals = readPeripherals(p.data);
        if (!peripherals) return;
        const text = JSON.stringify(peripherals);
        if (text !== JSON.stringify(this.s.peripherals)) this.log.log(`Peripherals reported by the printer: ${text}`);
        this.s.peripherals = peripherals;
        this.publish();
    }

    private logFeatures(features: Record<string, unknown>): void {
        const text = JSON.stringify(
            Object.fromEntries(Object.entries(features).sort(([a], [b]) => a.localeCompare(b))),
        );
        if (text === this.loggedFeatures) return;
        this.loggedFeatures = text;
        this.log.log(`Features reported by the printer: ${text}`);
    }

    private countLightTap(now: number, p: KobraMessage<KobraLightData>): void {
        if (now - this.lastOwnLightAt < LIGHT_OWN_COMMAND_MS) return;
        this.lightTaps = [...this.lightTaps.filter((t) => now - t <= LIGHT_TRIGGER_WINDOW_MS), now];
        this.log.log(
            `Light switched on the printer screen (${this.lightTaps.length}/${LIGHT_TRIGGER_TAPS}): action=${p.action} data=${JSON.stringify(p.data)}`,
        );
        if (this.lightTaps.length < LIGHT_TRIGGER_TAPS) return;
        this.lightTaps = [];
        this.log.log('Light switched three times on the printer: bed clear trigger');
        this.emit('light_trigger');
    }

    private suppliesUsageMm = 0;
    private readonly spoolUsage = new Map<number, number>();
    private readonly spoolReported = new Map<string, Map<number, number>>();
    private spoolLastUsage = 0;
    private spoolBaselineMm = 0;
    private readonly spoolLastSync = new Map<string, number>();

    resetSpoolUsage(): void {
        this.spoolmanReport(0.1);
        this.spoolUsage.clear();
        this.spoolReported.clear();
        this.spoolLastUsage = this.suppliesUsageMm;
        this.spoolBaselineMm = this.suppliesUsageMm;
        this.spoolLastSync.clear();
        this.saveUsage();
    }

    private saveUsage(): void {
        if (!this.currentJobId) return;
        const state: UsageState = {
            usage: [...this.spoolUsage],
            reported: [...this.spoolReported].map(([name, slots]) => [name, [...slots]]),
            last: this.spoolLastUsage,
            baseline: this.spoolBaselineMm,
        };
        void this.gcode
            .saveUsageState(this.currentJobId, JSON.stringify(state))
            .catch((e) => this.log.warn(`Job usage: ${(e as Error).message}`));
    }

    private restoreUsage(raw: string | undefined): void {
        if (!raw) return;
        const state = JSON.parse(raw) as UsageState;
        for (const [slot, mm] of state.usage) this.spoolUsage.set(slot, mm);
        for (const [name, slots] of state.reported) this.spoolReported.set(name, new Map(slots));
        this.spoolLastUsage = state.last;
        this.spoolBaselineMm = state.baseline;
    }

    private activeSinks(): FilamentUsageSink[] {
        return this.sinks.filter((x) => x.slotMap(this.config.id).size > 0);
    }

    private spoolmanAttribute(loaded: number, activity: Map<number, string>): void {
        if (this.s.printState !== 'printing' || !this.currentJobId) return;
        const current = this.suppliesUsageMm;
        const delta = current - this.spoolLastUsage;
        this.spoolLastUsage = current;
        if (delta <= 0 || loaded < 0) return;
        const act = activity.get(loaded);
        if (act === 'feeding' || act === 'retracting' || act === 'heating') return;
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
            out.set(slot, this.suppliesUsageMm - this.spoolBaselineMm - (reported.get(slot) ?? 0));
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
        let changed = false;
        for (const [slot, mm] of this.spoolmanUnreported(sink)) {
            const spoolId = map.get(slot);
            if (spoolId === undefined || mm < minMm) continue;
            changed = true;
            reported.set(slot, (reported.get(slot) ?? 0) + mm);
            sink.useFilament(spoolId, mm, this.config.id)
                .then(() => this.log.log(`${sink.name}: ${mm.toFixed(1)} mm → spool ${spoolId} (slot ${slot + 1})`))
                .catch((e) => this.log.warn(`${sink.name}: report failed (spool ${spoolId}): ${(e as Error).message}`));
        }
        if (changed) this.saveUsage();
    }

    private knownUrlKeys = '';
    private loggedFeatures = '';
    private loggedFans = '';
    private loggedUpdated = '';
    private printQueryLoggedFor = '';
    private paused = false;

    private readonly fileQueue = new Map<string, Promise<unknown>>();
    private readonly fileWaiters = new Map<string, (m: KobraMessage<KobraFileData>) => void>();
    private readonly printerThumbs = new Map<string, string>();

    private waitFileAction(
        action: string,
        send: () => void,
        timeoutMs = 8000,
        filename?: string,
    ): Promise<KobraMessage<KobraFileData> | null> {
        this.ensureConnected();
        const turn = (this.fileQueue.get(action) ?? Promise.resolve()).then(() =>
            this.sendFileAction(action, send, timeoutMs, filename),
        );
        this.fileQueue.set(
            action,
            turn.catch(() => null),
        );
        return turn;
    }

    private sendFileAction(
        action: string,
        send: () => void,
        timeoutMs: number,
        filename?: string,
    ): Promise<KobraMessage<KobraFileData> | null> {
        this.ensureConnected();
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (this.fileWaiters.get(action) === done) this.fileWaiters.delete(action);
                resolve(null);
            }, timeoutMs);
            const done = (m: KobraMessage<KobraFileData>) => {
                const answered = m.data?.filename || m.data?.file_details?.filename;
                if (filename && answered && baseName(answered) !== baseName(filename)) return;
                clearTimeout(timer);
                this.fileWaiters.delete(action);
                resolve(m);
            };
            this.fileWaiters.set(action, done);
            send();
        });
    }

    async listPrinterFiles(): Promise<PrinterFileListDto> {
        const res = await this.waitFileAction('listLocal', () => this.client.listLocalFiles(), 15000);
        if (res?.code !== 200) throw new BridgeRequestError(m.api_printer_no_file_list());
        const records = res.data?.records ?? [];
        const models = await this.waitFileAction(
            'listLocal',
            () => this.client.listLocalFiles(`/${TEST_MODEL_FOLDER}`),
            15000,
        );
        return {
            files: printerFiles(records, null),
            testModels: models?.code === 200 ? printerFiles(models.data?.records ?? [], TEST_MODEL_FOLDER) : [],
            truncated: records.length >= PRINTER_FILE_LIST_LIMIT,
        };
    }

    async deletePrinterFiles(filenames: string[]): Promise<void> {
        const res = await this.waitFileAction('deleteBatch', () => this.client.deleteLocalFiles(filenames));
        if (!res) {
            this.log.warn(`deleteBatch: no reply for ${filenames.join(', ')}`);
            throw new BridgeRequestError(m.api_delete_no_response());
        }
        if (res.state !== 'success' && res.code !== 200) {
            this.log.warn(`deleteBatch refused: state=${res.state} code=${res.code} msg=${res.msg ?? ''}`);
            throw this.refusal('file', res);
        }
        for (const f of filenames) {
            this.printerThumbs.delete(f);
            if (this.lastUpload?.filename === f) this.lastUpload = null;
        }
    }

    async printerFileThumbnail(filename: string): Promise<string> {
        const cached = this.printerThumbs.get(filename);
        if (cached !== undefined) return cached;
        const res = await this.waitFileAction(
            'fileDetails',
            () => this.client.requestFileDetails(filename),
            5000,
            filename,
        );
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
        const expected = active ? this.s.filename : this.lastUpload?.filename;
        if (thumb && fileName && fileName === expected) {
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
        const res = await this.client.skipObjects([...new Set([...this.s.skippedObjects, ...names])]);
        if (!res) throw new BridgeRequestError(m.api_skip_no_response());
        if (res.state === 'failed') throw this.refusal('skip', res);
    }

    async querySkip(): Promise<void> {
        this.ensureConnected();
        const prev = this.s.skipTs;
        void this.client.querySkipObjects();
        const deadline = Date.now() + 1500;
        while (Date.now() < deadline && this.s.skipTs <= prev) await delay(100);
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
            await delay(750);
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
            thumbnails: moonrakerThumbnails(
                filename,
                (tracked && this.s.thumbnail) || gf?.thumbnail || this.printerThumbs.get(filename) || '',
            ),
        };
    }

    async fileThumbnail(filename: string): Promise<Buffer | null> {
        const b64 =
            (filename === this.s.filename && this.s.thumbnail) ||
            (await this.gcode.getByFilename(filename))?.thumbnail ||
            this.printerThumbs.get(filename) ||
            '';
        const png = Buffer.from(b64, 'base64');
        return isPng(png) ? png : null;
    }

    get lastUploadedFilename(): string {
        return this.lastUpload?.filename ?? '';
    }

    private ensureConnected(): void {
        if (!this.client.connected) throw new BridgeOfflineError(connectionErrorMessage(this.s.connectionError));
    }

    setTemperature(nozzle?: number, bed?: number): void {
        this.ensureConnected();
        const task = this.s.printState === 'printing' || this.s.printState === 'paused';
        if (task) this.client.setPrintingTemperature(this.s.taskId, nozzle, bed);
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
        const wanted = brightness ?? this.s.lightBrightness;
        const b = on ? (wanted > 0 ? wanted : 100) : 0;
        this.lastOwnLightAt = Date.now();
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

    async moveAxis(axis: number, moveType: number, distance: number): Promise<void> {
        this.ensureConnected();
        const res = await this.client.moveAxis(axis, moveType, distance);
        if (!res) return;
        if (res.state === 'failed') {
            throw new BridgeRequestError(printerRefusedMessage(res.code, res.msg ?? ''));
        }
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
        const next = {
            status: action === 'start' ? 1 : 0,
            targetTemp: action === 'start' ? opts.targetTemp : 0,
            duration: action === 'start' ? opts.duration : 0,
            remainTime: action === 'start' ? opts.duration : 0,
        };
        for (const u of this.s.aceUnits) if (ids.includes(u.id)) u.drying = { ...u.drying, ...next };
        this.s.aceDrying = { ...this.s.aceDrying, ...next };
        this.publish();
    }

    private refusal(topic: string, res: KobraMessage): BridgeRequestError {
        const refused = `${this.config.id}:${topic}:${res.action ?? ''}`;
        return new BridgeRequestError(printerRefusedMessage(res.code, res.msg ?? ''), refused);
    }

    private expectAccepted(result: KobraMessage | null): void {
        if (!result) throw new BridgeRequestError(m.api_command_no_response());
        if (result.state === 'failed') throw this.refusal('print', result);
    }

    async pause(): Promise<void> {
        this.ensureConnected();
        this.expectAccepted(await this.client.pausePrint(this.s.taskId));
    }

    async resume(): Promise<void> {
        this.ensureConnected();
        this.expectAccepted(await this.client.resumePrint(this.s.taskId));
    }

    async cancel(reason: FailureReason | '' = ''): Promise<void> {
        this.ensureConnected();
        this.cancelReason = reason;
        try {
            this.expectAccepted(await this.client.stopPrint(this.s.taskId));
        } catch (e) {
            this.cancelReason = '';
            throw e;
        }
    }

    async startCamera(): Promise<string> {
        this.ensureConnected();
        if (this.camera.running && Date.now() - this.camera.latestJpegAt < CAMERA_FRESH_MS) {
            this.cameraUserStopped = false;
            return 'streaming';
        }
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
        this.camera.keepAlive = false;
        this.camera.stop();
        await this.client.stopCamera();
    }

    private maintainCamera(): void {
        const wanted = this.config.settings.cameraAlwaysOn && !this.cameraUserStopped;
        this.camera.keepAlive = wanted;
        if (!wanted) return;
        if (this.camera.hasUrl) this.camera.ensureRunning();
        const now = Date.now();
        if (now - this.camera.latestJpegAt < CAMERA_STALE_MS || now - this.cameraKickAt < CAMERA_KICK_INTERVAL_MS)
            return;
        this.cameraKickAt = now;
        void this.client
            .startCamera()
            .then(() => {
                this.camera.reset();
                this.camera.ensureRunning();
            })
            .catch((e) => this.log.warn(`Camera keep-alive: ${String(e)}`));
    }

    resetCamera(): void {
        this.camera.reset();
        this.camera.ensureRunning();
    }

    clearFileReady(): void {
        this.s.fileReady = '';
        this.printHold = null;
        this.publish();
    }

    async reconnectNow(): Promise<void> {
        this.paused = false;
        this.s.manualOffline = false;
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
        if (opts.print && !this.config.settings.printStartDialog) {
            await this.startPrint(file, { serveBase: opts.serveBase });
        } else {
            if (this.config.settings.printStartDialog) {
                this.printHold = { fileId: file.id, until: Date.now() + PRINT_HOLD_MS };
                this.log.log(`${file.filename} held for the print start dialog (print=${opts.print})`);
            }
            this.s.fileReady = file.filename;
            this.s.fileReadyTs = Date.now();
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

        if (this.s.printState !== 'printing' && this.s.printState !== 'paused') this.s.thumbnail = '';
        this.client.requestFileDetails(file.filename);
    }

    isHeldForDialog(fileId: string): boolean {
        const hold = this.printHold;
        if (!hold) return false;
        if (Date.now() > hold.until) {
            this.printHold = null;
            return false;
        }
        return hold.fileId === fileId;
    }

    async printStoredFile(fileId: string, opts: StartPrintOptions): Promise<StoredFile> {
        this.ensureConnected();
        this.printHold = null;
        const loaded = await this.gcode.readData(fileId);
        if (!loaded) throw new BridgeRequestError(m.api_file_not_in_store());
        if (!this.alreadyOnPrinter(loaded.file)) {
            await this.pushToPrinter(loaded.file, loaded.data);
            await this.startPrint(loaded.file, opts);
            return loaded.file;
        }
        this.log.log(`${loaded.file.filename} already on the printer, upload skipped`);
        try {
            await this.startPrint(loaded.file, opts);
        } catch (e) {
            this.lastUpload = null;
            throw e;
        }
        return loaded.file;
    }

    private alreadyOnPrinter(file: StoredFile): boolean {
        const last = this.lastUpload;
        return !!last && last.filename === file.filename && last.md5 === file.md5 && last.size === file.sizeBytes;
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

    async printPrinterFile(path: string, sizeBytes: number, autoLeveling?: boolean): Promise<void> {
        this.ensureConnected();
        const target = splitPrinterFilePath(path);
        if (!target) throw new BridgeRequestError(m.api_file_not_found());
        const filename = target.folder ? `/${target.folder}/${target.filename}` : target.filename;
        const mapping = buildAutoAmsBoxMapping(this.loadedSlotsForPrint(), this.filamentMode);
        const payload: PrintStartPayload = {
            taskid: '-1',
            url: '',
            filename: target.filename,
            md5: '',
            filepath: target.folder ? filename : `/${filename}`,
            filetype: 1,
            project_type: 1,
            filesize: sizeBytes,
            ams_settings: { use_ams: mapping.length > 0, ams_box_mapping: mapping },
            task_settings: this.taskSettings([], { autoLeveling }),
        };
        this.log.log(
            `print/start (printer file) → ${filename}  ams=${mapping.length} slots  task_settings=${JSON.stringify(payload.task_settings)}`,
        );
        await this.requestStart(payload, () => {
            this.s.fileReady = '';
            this.s.skippedObjects = [];
            this.s.skipTs = Date.now();
            this.s.slicerTimeSec = 0;
            this.s.thumbnail = this.printerThumbs.get(path.replace(/^\/+/, '')) ?? '';
            this.s.printSlots = { filename, slots: printSlotsFromMapping(mapping, this.filamentMode) };
        });
        this.s.filename = filename;
        this.jobsReconciled = true;
        await this.jobSync;
        this.jobSync = this.beginJob(filename, null).finally(() => {
            this.jobSync = null;
        });
        await this.jobSync;
        this.publish();
    }

    private async requestStart(payload: PrintStartPayload, apply: () => void): Promise<void> {
        const { fileReady, skippedObjects, skipTs, slicerTimeSec, thumbnail, printSlots } = this.s;
        const { layerHeight, firstLayerHeight, jobOptions, currentJobId } = this;
        apply();
        const result = await this.client.startPrint(payload);
        if (!result || result.state === 'failed' || (result.code !== undefined && result.code !== 0)) {
            Object.assign(this.s, { fileReady, skippedObjects, skipTs, slicerTimeSec, thumbnail, printSlots });
            Object.assign(this, { layerHeight, firstLayerHeight, jobOptions });
            this.publish();
            if (!result) throw new BridgeRequestError(m.api_print_no_response());
            this.log.warn(`print/start refused: ${JSON.stringify(result)}`);
            throw this.refusal('print', result);
        }
        if (!currentJobId || this.currentJobId !== currentJobId) return;
        this.abandonJob();
        apply();
    }

    private taskSettings(
        excluded: string[],
        opts: Pick<StartPrintOptions, 'autoLeveling' | 'vibrationCompensation' | 'flowCalibration'> = {},
    ): PrintStartPayload['task_settings'] {
        const s = this.config.settings;
        const on = (option: PrintOption) =>
            supportsPrintOption(this.s.features, option) && (opts[option] ?? s[option]) ? 1 : 0;
        return {
            auto_leveling: on('autoLeveling'),
            vibration_compensation: on('vibrationCompensation'),
            flow_calibration: on('flowCalibration'),
            dry_mode: 0,
            ai_settings: { status: 0, count: 0, type: 1 },
            timelapse: { status: 0, count: 0, type: 64 },
            drying_settings: { status: 0, target_temp: 0, duration: 0, remain_time: 0 },
            model_objects_skip_parts: excluded,
        };
    }

    private amsMappingForPrint(file: StoredFile, assignments: FilamentAssignment[] | undefined) {
        if (assignments?.length) {
            const built = buildAssignedAmsBoxMapping(assignments, file.filaments, this.s.amsSlots, this.filamentMode);
            if (built.invalid) this.log.warn(`Ignored ${built.invalid} unusable filament assignment(s)`);
            if (!built.mapping.length) throw new BridgeRequestError(m.api_no_usable_assignments());
            return built.mapping;
        }
        let loaded = this.loadedSlotsForPrint();
        const used = new Set(file.filaments.filter((f) => f.isUsed).map((f) => f.slotIndex));
        if (used.size) loaded = loaded.filter((s) => used.has(s.globalIndex));
        return buildAutoAmsBoxMapping(loaded, this.filamentMode);
    }

    private async startPrint(file: StoredFile, opts: StartPrintOptions): Promise<void> {
        const excluded = (opts.excludedObjects ?? []).filter((n) => file.objects.includes(n));
        const mapping = this.amsMappingForPrint(file, opts.filamentAssignments);
        const url = `${opts.serveBase}/serve/${file.id}/${encodeURIComponent(file.filename)}`;
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
            task_settings: this.taskSettings(excluded, opts),
        };
        this.log.log(
            `print/start → ${file.filename}  ams=${mapping.length} slots  mode=${this.filamentMode}  task_settings=${JSON.stringify(payload.task_settings)}`,
        );
        await this.requestStart(payload, () => {
            this.s.fileReady = '';
            this.s.skippedObjects = excluded;
            this.s.skipTs = Date.now();
            this.jobOptions = { timelapse: opts.timelapse, failureDetection: opts.failureDetection };
            this.s.slicerTimeSec = file.estPrintTimeSec;
            this.s.thumbnail = file.thumbnail ?? '';
            this.layerHeight = file.layerHeight;
            this.firstLayerHeight = file.firstLayerHeight || file.layerHeight;
            this.s.printSlots = { filename: file.filename, slots: printSlotsFromMapping(mapping, this.filamentMode) };
        });
        this.s.filename = file.filename;
        this.jobsReconciled = true;
        await this.jobSync;
        this.jobSync = this.beginJob(file.filename, file).finally(() => {
            this.jobSync = null;
        });
        await this.jobSync;
        this.publish();
        if (excluded.length) void this.applyPreprintSkip(excluded);
    }
}

export type JobEndStatus = 'completed' | 'cancelled' | 'error';

export interface StartPrintOptions {
    serveBase: string;
    autoLeveling?: boolean;
    excludedObjects?: string[];
    filamentAssignments?: FilamentAssignment[];
    vibrationCompensation?: boolean;
    flowCalibration?: boolean;
    timelapse?: boolean;
    failureDetection?: boolean;
}

export class BridgeOfflineError extends Error {}

export class BridgeRequestError extends Error {
    constructor(
        message: string,
        readonly refused?: string,
    ) {
        super(message);
    }
}

interface UsageState {
    usage: [slot: number, mm: number][];
    reported: [sink: string, slots: [slot: number, mm: number][]][];
    last: number;
    baseline: number;
}

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function baseName(filename: string): string {
    return filename.slice(filename.lastIndexOf('/') + 1);
}

function printerFiles(records: KobraFileRecord[], folder: string | null): PrinterFileDto[] {
    return records
        .filter((r) => !r.is_dir)
        .map((r) => ({
            filename: r.filename,
            sizeBytes: Number(r.size ?? 0),
            timestamp: Number(r.timestamp ?? 0),
            folder,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
}

function mqttConnectionError(e: unknown): ConnectionError {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Not authorized|Bad username|code 4|code 5/i.test(msg)) return { code: 'mqtt_auth', detail: msg };
    if (/ECONNREFUSED/.test(msg)) return { code: 'mqtt_refused', detail: msg };
    if (/ETIMEDOUT|EHOSTUNREACH/.test(msg)) return { code: 'unreachable', detail: msg };
    return { code: 'other', detail: msg };
}
