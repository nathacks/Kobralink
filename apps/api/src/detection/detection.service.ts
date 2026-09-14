import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
    DetectionBox,
    DetectionModelDto,
    FailureDetectionSettings,
    FailureDetectionStatusDto,
    PrinterDetectionDto,
} from '@kobralink/shared';
import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { loadEnv } from '../config/env';
import { m } from '../i18n/locale';
import { NotificationService } from '../notifications/notification.service';
import { SettingsService } from '../settings/settings.service';
import { FailureModel, loadOrt } from './model';
import { DETECTION_THRESH, ESCALATING_FACTOR, FailurePrediction } from './prediction';

const MODEL_URL =
    process.env.KOBRALINK_DETECTION_MODEL_URL ??
    'https://tsd-pub-static.s3.amazonaws.com/ml-models/model-weights-5a6b1be1fa.onnx';
const MODEL_MIN_BYTES = 50 * 1024 * 1024;
const TICK_MS = 1000;
const FRAME_TIMEOUT_MS = 5000;

interface Watch {
    bridge: PrinterBridge;
    prediction: FailurePrediction;
    detach: () => void;
    unsubscribe: (() => void) | null;
    busy: boolean;
    lastAt: number;
    lastInferenceMs: number;
    boxes: DetectionBox[];
    warned: boolean;
    acted: boolean;
    triggeredAt: number;
}

@Injectable()
export class DetectionService implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(DetectionService.name);
    private readonly dir = path.join(loadEnv().dataDir, 'models');
    private readonly modelPath = path.join(this.dir, 'failure-detection.onnx');
    private readonly watches = new Map<string, Watch>();
    private model: FailureModel | null = null;
    private loading: Promise<FailureModel | null> | null = null;
    private timer: NodeJS.Timeout | null = null;
    private download: { controller: AbortController; downloaded: number; total: number } | null = null;
    private modelError = '';

    constructor(
        private readonly settings: SettingsService,
        private readonly notifications: NotificationService,
    ) {}

    onModuleInit(): void {
        fs.mkdirSync(this.dir, { recursive: true });
        this.timer = setInterval(() => void this.tick(), TICK_MS);
        this.settings.on('change', (next) => {
            if (!next.failureDetection.enabled) void this.unload();
        });
    }

    async onModuleDestroy(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
        this.download?.controller.abort();
        for (const id of [...this.watches.keys()]) this.detach(id);
        await this.unload();
    }

    attach(bridge: PrinterBridge): void {
        const watch: Watch = {
            bridge,
            prediction: new FailurePrediction(),
            detach: () => undefined,
            unsubscribe: null,
            busy: false,
            lastAt: 0,
            lastInferenceMs: 0,
            boxes: [],
            warned: false,
            acted: false,
            triggeredAt: 0,
        };
        const onJob = (phase: 'start' | 'end') => {
            watch.prediction.reset();
            watch.boxes = [];
            watch.warned = false;
            watch.acted = false;
            watch.triggeredAt = 0;
            if (phase === 'end') this.stopWatching(watch);
        };
        bridge.on('job', onJob);
        watch.detach = () => bridge.off('job', onJob);
        this.watches.set(bridge.id, watch);
    }

    detach(printerId: string): void {
        const watch = this.watches.get(printerId);
        if (!watch) return;
        watch.detach();
        this.stopWatching(watch);
        this.watches.delete(printerId);
    }

    status(): FailureDetectionStatusDto {
        const ort = loadOrt();
        const cfg = this.settings.get().failureDetection;
        const printers: Record<string, PrinterDetectionDto> = {};
        for (const [id, w] of this.watches) printers[id] = this.toDto(w, cfg);
        return { runtimeAvailable: ort.module !== null, runtimeError: ort.error, model: this.modelStatus(), printers };
    }

    printerStatus(printerId: string): PrinterDetectionDto | null {
        const w = this.watches.get(printerId);
        return w ? this.toDto(w, this.settings.get().failureDetection) : null;
    }

    private toDto(w: Watch, c: FailureDetectionSettings): PrinterDetectionDto {
        return {
            active: w.unsubscribe !== null,
            frames: w.prediction.frames,
            score: w.prediction.score(c.sensitivity),
            failing: w.prediction.isFailing(c.sensitivity),
            lastAt: w.lastAt,
            lastInferenceMs: w.lastInferenceMs,
            boxes: w.boxes,
            triggeredAt: w.triggeredAt,
        };
    }

    private modelStatus(): DetectionModelDto {
        if (this.download) {
            const { downloaded, total } = this.download;
            return {
                state: 'downloading',
                progress: total > 0 ? downloaded / total : 0,
                sizeBytes: total,
                downloadedBytes: downloaded,
                error: '',
            };
        }
        const size = this.modelSize();
        if (size > 0) return { state: 'ready', progress: 1, sizeBytes: size, downloadedBytes: size, error: '' };
        return {
            state: this.modelError ? 'error' : 'missing',
            progress: 0,
            sizeBytes: 0,
            downloadedBytes: 0,
            error: this.modelError,
        };
    }

    private modelSize(): number {
        try {
            return fs.statSync(this.modelPath).size;
        } catch {
            return 0;
        }
    }

    async downloadModel(): Promise<DetectionModelDto> {
        if (this.download) return this.modelStatus();
        if (this.modelSize() > 0) return this.modelStatus();
        const controller = new AbortController();
        this.download = { controller, downloaded: 0, total: 0 };
        this.modelError = '';
        void this.runDownload(controller);
        return this.modelStatus();
    }

    cancelDownload(): DetectionModelDto {
        this.download?.controller.abort();
        return this.modelStatus();
    }

    async deleteModel(): Promise<DetectionModelDto> {
        if (this.download) throw new BadRequestException(m.api_detection_download_in_progress());
        await this.unload();
        fs.rmSync(this.modelPath, { force: true });
        this.modelError = '';
        if (this.settings.get().failureDetection.enabled) {
            await this.settings.update({
                failureDetection: { ...this.settings.get().failureDetection, enabled: false },
            });
        }
        return this.modelStatus();
    }

    private async runDownload(controller: AbortController): Promise<void> {
        const part = `${this.modelPath}.part`;
        const state = this.download as NonNullable<typeof this.download>;
        try {
            const res = await fetch(MODEL_URL, { signal: controller.signal });
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
            state.total = Number(res.headers.get('content-length') ?? 0);
            const counter = new Transform({
                transform: (chunk: Buffer, _enc, cb) => {
                    state.downloaded += chunk.length;
                    cb(null, chunk);
                },
            });
            await pipeline(
                Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
                counter,
                fs.createWriteStream(part),
                { signal: controller.signal },
            );
            const size = fs.statSync(part).size;
            if (size < MODEL_MIN_BYTES || (state.total > 0 && size !== state.total)) {
                throw new Error(m.api_detection_download_incomplete());
            }
            fs.renameSync(part, this.modelPath);
            this.log.log(`Failure detection model downloaded (${(size / 1024 / 1024).toFixed(0)} MB)`);
        } catch (e) {
            fs.rmSync(part, { force: true });
            this.modelError = controller.signal.aborted ? '' : e instanceof Error ? e.message : String(e);
            if (this.modelError) this.log.warn(`Model download failed: ${this.modelError}`);
        } finally {
            this.download = null;
        }
    }

    private async ensureModel(): Promise<FailureModel | null> {
        if (this.model) return this.model;
        if (this.loading) return this.loading;
        this.loading = (async () => {
            const ort = loadOrt();
            if (!ort.module) return null;
            if (this.modelSize() === 0) return null;
            const model = new FailureModel(ort.module);
            try {
                await model.load(this.modelPath);
            } catch (e) {
                this.modelError = e instanceof Error ? e.message : String(e);
                this.log.warn(`Model load failed: ${this.modelError}`);
                return null;
            }
            this.model = model;
            this.log.log('Failure detection model loaded');
            return model;
        })().finally(() => {
            this.loading = null;
        });
        return this.loading;
    }

    private async unload(): Promise<void> {
        for (const w of this.watches.values()) this.stopWatching(w);
        const model = this.model;
        this.model = null;
        await model?.release();
    }

    private stopWatching(watch: Watch): void {
        watch.unsubscribe?.();
        watch.unsubscribe = null;
    }

    private async tick(): Promise<void> {
        const cfg = this.settings.get().failureDetection;
        if (!cfg.enabled) return;
        const now = Date.now();
        for (const w of this.watches.values()) {
            const printing = w.bridge.snapshot().printState === 'printing';
            const wanted = printing && w.bridge.settings.failureDetection && !w.acted;
            if (!wanted) {
                if (w.unsubscribe) this.stopWatching(w);
                continue;
            }
            if (w.busy || now - w.lastAt < cfg.intervalSec * 1000) continue;
            w.busy = true;
            void this.analyze(w, cfg).finally(() => {
                w.busy = false;
            });
        }
    }

    private async analyze(w: Watch, cfg: FailureDetectionSettings): Promise<void> {
        const model = await this.ensureModel();
        if (!model) return;
        if (!w.unsubscribe) {
            if (!w.bridge.camera.hasUrl) {
                await w.bridge.client.startCamera().catch((e) => this.log.warn(`Camera start: ${String(e)}`));
            }
            w.unsubscribe = w.bridge.camera.subscribe(() => undefined);
        }
        const frame = await w.bridge.camera.waitForFrame(FRAME_TIMEOUT_MS);
        w.lastAt = Date.now();
        if (!frame) return;
        try {
            const t0 = Date.now();
            w.boxes = await model.detect(frame, DETECTION_THRESH);
            w.lastInferenceMs = Date.now() - t0;
        } catch (e) {
            this.log.warn(`Inference failed: ${(e as Error).message}`);
            return;
        }
        w.prediction.update(w.boxes);
        this.evaluate(w, cfg);
    }

    private evaluate(w: Watch, cfg: FailureDetectionSettings): void {
        const p = w.prediction;
        const s = cfg.sensitivity;
        const score = Math.round(p.score(s) * 100);
        const filename = w.bridge.snapshot().filename;
        if (cfg.action !== 'notify' && p.isFailing(s, ESCALATING_FACTOR)) {
            w.acted = true;
            w.triggeredAt = Date.now();
            this.stopWatching(w);
            this.log.warn(`Print failure detected on ${w.bridge.config.name} (score ${score}) → ${cfg.action}`);
            const act = cfg.action === 'pause' ? w.bridge.pause() : w.bridge.cancel();
            void act.catch((e) => this.log.warn(`Failure action ${cfg.action} failed: ${(e as Error).message}`));
            this.notifications.emitCustom(w.bridge.id, w.bridge.config.name, 'alert_print_failure', {
                score,
                action: cfg.action,
                filename,
            });
            return;
        }
        if (p.isFailing(s)) {
            if (w.warned) return;
            w.warned = true;
            w.triggeredAt = Date.now();
            this.log.warn(`Possible print failure on ${w.bridge.config.name} (score ${score})`);
            this.notifications.emitCustom(w.bridge.id, w.bridge.config.name, 'alert_print_failure', {
                score,
                action: 'notify',
                filename,
            });
        } else if (p.score(s) < 0.3) {
            w.warned = false;
        }
    }
}
