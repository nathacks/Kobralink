import { type ChildProcessByStdio, spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { m } from '../i18n/locale';

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const IDLE_STOP_MS = 60_000;
const FIRST_FRAME_TIMEOUT_MS = 8_000;
const MAX_BACKOFF_MS = 300_000;
const BOUNDARY = 'kobralinkframe';

type FfmpegProc = ChildProcessByStdio<null, Readable, Readable> & { stdio: (Readable | null)[] };

export function resolveFfmpeg(): string {
    if (process.env.KOBRALINK_FFMPEG) return process.env.KOBRALINK_FFMPEG;
    try {
        const installer = require('@ffmpeg-installer/ffmpeg') as { path?: string };
        if (installer.path) return installer.path;
    } catch {}
    return 'ffmpeg';
}

export class CameraCache {
    private url = '';
    private proc: FfmpegProc | null = null;
    private restartTimer: NodeJS.Timeout | null = null;
    private idleTimer: NodeJS.Timeout | null = null;
    private failCount = 0;
    private readonly subscribers = new Set<(frame: Buffer) => void>();
    private readonly tsSubscribers = new Set<(chunk: Buffer) => void>();
    private readonly waiters = new Set<(frame: Buffer | null) => void>();
    private lastError = '';
    latestJpeg: Buffer | null = null;
    latestJpegAt = 0;

    constructor(private readonly log: Logger) {}

    get hasUrl(): boolean {
        return this.url !== '';
    }

    get running(): boolean {
        return this.proc !== null;
    }

    get error(): string {
        return this.lastError;
    }

    setUrl(url: string): void {
        const changed = Boolean(url && this.url && url !== this.url);
        this.url = url;
        if (changed) {
            this.log.log('Camera URL changed, restarting ffmpeg');
            this.reset();
        }
    }

    reset(): void {
        this.failCount = 0;
        this.lastError = '';
        this.stop();
    }

    stop(): void {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = null;
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = null;
        const proc = this.proc;
        this.proc = null;
        if (proc) proc.kill('SIGKILL');
        for (const w of this.waiters) w(null);
        this.waiters.clear();
    }

    ensureRunning(): void {
        if (!this.url) return;
        this.touch();
        if (this.proc || this.restartTimer) return;
        this.spawnFfmpeg();
    }

    subscribe(fn: (frame: Buffer) => void): () => void {
        this.subscribers.add(fn);
        this.ensureRunning();
        return () => {
            this.subscribers.delete(fn);
            this.touch();
        };
    }

    subscribeTs(fn: (chunk: Buffer) => void): () => void {
        this.tsSubscribers.add(fn);
        this.ensureRunning();
        return () => {
            this.tsSubscribers.delete(fn);
            this.touch();
        };
    }

    async streamTsTo(res: Response): Promise<boolean> {
        const first = await this.waitForFrame();
        if (!first) return false;
        res.writeHead(200, {
            'Content-Type': 'video/mp2t',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        let queued = 0;
        const write = (chunk: Buffer) => {
            if (res.destroyed || queued > 64) return;
            queued += 1;
            res.write(chunk, () => {
                queued -= 1;
            });
        };
        const unsubscribe = this.subscribeTs(write);
        await new Promise<void>((resolve) => res.once('close', resolve));
        unsubscribe();
        return true;
    }

    waitForFrame(timeoutMs = FIRST_FRAME_TIMEOUT_MS): Promise<Buffer | null> {
        if (this.latestJpeg && Date.now() - this.latestJpegAt < 3_000) return Promise.resolve(this.latestJpeg);
        this.ensureRunning();
        if (!this.proc) return Promise.resolve(null);
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.waiters.delete(done);
                resolve(null);
            }, timeoutMs);
            const done = (frame: Buffer | null) => {
                clearTimeout(timer);
                this.waiters.delete(done);
                resolve(frame);
            };
            this.waiters.add(done);
        });
    }

    async streamTo(res: Response): Promise<boolean> {
        const first = await this.waitForFrame();
        if (!first) return false;
        res.writeHead(200, {
            'Content-Type': `multipart/x-mixed-replace;boundary=${BOUNDARY}`,
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            Pragma: 'no-cache',
        });
        let pending = false;
        const write = (frame: Buffer) => {
            if (pending || res.destroyed) return;
            pending = true;
            const header = Buffer.from(
                `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
            );
            res.write(Buffer.concat([header, frame, Buffer.from('\r\n')]), () => {
                pending = false;
            });
        };
        write(first);
        const unsubscribe = this.subscribe(write);
        await new Promise<void>((resolve) => res.once('close', resolve));
        unsubscribe();
        return true;
    }

    private touch(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            if (this.subscribers.size === 0 && this.tsSubscribers.size === 0 && this.proc) {
                this.log.log('Camera idle, stopping ffmpeg');
                this.stop();
            }
        }, IDLE_STOP_MS);
    }

    private inputArgs(url: string): string[] {
        const base = ['-fflags', 'nobuffer', '-flags', 'low_delay', '-timeout', '10000000'];
        if (url.toLowerCase().startsWith('rtsp://')) {
            return [...base, '-probesize', '32', '-analyzeduration', '0', '-rtsp_transport', 'tcp'];
        }
        return [...base, '-use_wallclock_as_timestamps', '1', '-probesize', '500000', '-analyzeduration', '500000'];
    }

    private spawnFfmpeg(): void {
        const url = this.url;
        const args = [
            '-loglevel',
            'warning',
            ...this.inputArgs(url),
            '-i',
            url,
            '-vf',
            'fps=15,scale=640:-2',
            '-f',
            'image2pipe',
            '-vcodec',
            'mjpeg',
            '-q:v',
            '3',
            '-flush_packets',
            '1',
            'pipe:1',
            '-c:v',
            'copy',
            '-an',
            '-f',
            'mpegts',
            '-flush_packets',
            '1',
            'pipe:3',
        ];
        let proc: FfmpegProc;
        try {
            proc = spawn(resolveFfmpeg(), args, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] }) as FfmpegProc;
        } catch (e) {
            this.onExit(null, e instanceof Error ? e.message : String(e));
            return;
        }
        this.proc = proc;
        this.log.log(`ffmpeg started (${url.replace(/\?.*$/, '')})`);

        let buf: Buffer = Buffer.alloc(0);
        let stderr = '';
        proc.stdout.on('data', (chunk: Buffer) => {
            if (this.proc !== proc) return;
            buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
            for (;;) {
                const start = buf.indexOf(SOI);
                if (start < 0) {
                    buf = Buffer.alloc(0);
                    break;
                }
                const end = buf.indexOf(EOI, start + 2);
                if (end < 0) {
                    if (start > 0) buf = buf.subarray(start);
                    break;
                }
                const frame = Buffer.from(buf.subarray(start, end + 2));
                buf = buf.subarray(end + 2);
                this.onFrame(frame);
            }
        });
        proc.stdio[3]?.on('data', (chunk: Buffer) => {
            if (this.proc !== proc) return;
            for (const s of this.tsSubscribers) s(chunk);
        });
        proc.stderr.on('data', (chunk: Buffer) => {
            stderr = (stderr + chunk.toString()).slice(-2000);
        });
        proc.on('error', (e) => {
            if (this.proc !== proc) return;
            this.proc = null;
            this.onExit(null, e.message);
        });
        proc.on('exit', (code) => {
            if (this.proc !== proc) return;
            this.proc = null;
            this.onExit(code, stderr.trim().split('\n').pop() ?? '');
        });
    }

    private onFrame(frame: Buffer): void {
        this.failCount = 0;
        this.lastError = '';
        this.latestJpeg = frame;
        this.latestJpegAt = Date.now();
        for (const w of this.waiters) w(frame);
        this.waiters.clear();
        for (const s of this.subscribers) s(frame);
    }

    private onExit(code: number | null, detail: string): void {
        for (const w of this.waiters) w(null);
        this.waiters.clear();
        this.failCount += 1;
        this.lastError = detail || m.api_ffmpeg_exited({ code: code ?? '?' });
        const rateLimited = /4XX|429/.test(detail);
        const delay = Math.min(Math.max(2_000 * 2 ** this.failCount, rateLimited ? 30_000 : 0), MAX_BACKOFF_MS);
        if (rateLimited) this.lastError = m.api_camera_rate_limited();
        this.log.warn(`ffmpeg exited (code ${code}), retrying in ${Math.round(delay / 1000)} s — ${detail}`);
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            if (this.subscribers.size > 0 || this.tsSubscribers.size > 0 || this.waiters.size > 0) this.spawnFfmpeg();
        }, delay);
    }
}

export async function serveStream(cache: CameraCache, res: Response): Promise<void> {
    if (!cache.hasUrl) {
        res.status(503).json({ message: m.api_camera_no_url() });
        return;
    }
    if (!(await cache.streamTo(res))) {
        res.status(503).json({ message: cache.error || m.api_camera_no_frame() });
    }
}

export async function serveH264(cache: CameraCache, res: Response): Promise<void> {
    if (!cache.hasUrl) {
        res.status(503).json({ message: m.api_camera_no_url() });
        return;
    }
    if (!(await cache.streamTsTo(res))) {
        res.status(503).json({ message: cache.error || m.api_camera_no_frame() });
    }
}

export async function serveSnapshot(cache: CameraCache, res: Response): Promise<void> {
    if (!cache.hasUrl) {
        res.status(503).json({ message: m.api_camera_no_url_short() });
        return;
    }
    const frame = await cache.waitForFrame();
    if (!frame) {
        res.status(503).json({ message: cache.error || m.api_camera_no_frame() });
        return;
    }
    const age = (Date.now() - cache.latestJpegAt) / 1000;
    res.setHeader('Cache-Control', 'no-cache');
    if (age > 10) res.setHeader('X-Frame-Age', age.toFixed(1));
    res.type('image/jpeg').send(frame);
}
