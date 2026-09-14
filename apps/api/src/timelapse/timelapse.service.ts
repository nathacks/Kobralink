import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { TimelapseDto } from '@kobralink/shared';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { resolveFfmpeg } from '../bridge/camera';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { loadEnv } from '../config/env';
import type { Timelapse } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MIN_FRAME_GAP_MS = 1500;

interface Recording {
    id: string;
    dir: string;
    frames: number;
    lastFrameAt: number;
    unsubscribe: () => void;
    capturing: boolean;
}

@Injectable()
export class TimelapseService implements OnModuleInit {
    private readonly log = new Logger(TimelapseService.name);
    private readonly root = path.join(loadEnv().dataDir, 'timelapses');
    private readonly recordings = new Map<string, Recording>();
    private readonly detached = new Map<string, () => void>();

    constructor(private readonly prisma: PrismaService) {}

    async onModuleInit(): Promise<void> {
        fs.mkdirSync(this.root, { recursive: true });
        const stale = await this.prisma.client.timelapse.findMany({
            where: { status: { in: ['recording', 'rendering'] } },
        });
        for (const t of stale) {
            const dir = this.dirFor(t.id);
            const frames = this.countFrames(dir);
            if (frames >= 10) void this.render(t.id, dir, 15);
            else {
                await this.prisma.client.timelapse.delete({ where: { id: t.id } }).catch(() => null);
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    }

    private dirFor(id: string): string {
        return path.join(this.root, id);
    }

    private videoPath(id: string): string {
        return path.join(this.dirFor(id), 'timelapse.mp4');
    }

    private posterPath(id: string): string {
        return path.join(this.dirFor(id), 'poster.jpg');
    }

    private countFrames(dir: string): number {
        try {
            return fs.readdirSync(path.join(dir, 'frames')).filter((f) => f.endsWith('.jpg')).length;
        } catch {
            return 0;
        }
    }

    attach(bridge: PrinterBridge): void {
        const onJob = (phase: 'start' | 'end', jobId: string, filename: string) => {
            if (phase === 'start') void this.begin(bridge, jobId, filename);
            else void this.finish(bridge);
        };
        const onLayer = () => void this.capture(bridge);
        bridge.on('job', onJob);
        bridge.on('layer', onLayer);
        this.detached.set(bridge.id, () => {
            bridge.off('job', onJob);
            bridge.off('layer', onLayer);
        });
    }

    detach(printerId: string): void {
        this.detached.get(printerId)?.();
        this.detached.delete(printerId);
        const rec = this.recordings.get(printerId);
        if (rec) {
            rec.unsubscribe();
            this.recordings.delete(printerId);
        }
    }

    isRecording(printerId: string): boolean {
        return this.recordings.has(printerId);
    }

    private async begin(bridge: PrinterBridge, jobId: string, filename: string): Promise<void> {
        if (!bridge.settings.timelapseEnabled) return;
        if (this.recordings.has(bridge.id)) return;
        const row = await this.prisma.client.timelapse.create({
            data: { printerId: bridge.id, jobId, filename, status: 'recording' },
        });
        const dir = this.dirFor(row.id);
        fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
        if (!bridge.camera.hasUrl) {
            await bridge.client.startCamera().catch((e) => this.log.warn(`Camera start for timelapse: ${String(e)}`));
        }
        const unsubscribe = bridge.camera.subscribe(() => undefined);
        this.recordings.set(bridge.id, { id: row.id, dir, frames: 0, lastFrameAt: 0, unsubscribe, capturing: false });
        this.log.log(`Timelapse started for ${filename} (${row.id})`);
        void this.capture(bridge);
    }

    private async capture(bridge: PrinterBridge): Promise<void> {
        const rec = this.recordings.get(bridge.id);
        if (!rec || rec.capturing) return;
        if (Date.now() - rec.lastFrameAt < MIN_FRAME_GAP_MS) return;
        rec.capturing = true;
        try {
            const frame = await bridge.camera.waitForFrame(5000);
            if (!frame) return;
            rec.frames += 1;
            rec.lastFrameAt = Date.now();
            const name = `${String(rec.frames).padStart(5, '0')}.jpg`;
            await fs.promises.writeFile(path.join(rec.dir, 'frames', name), frame);
            if (rec.frames % 20 === 0) {
                await this.prisma.client.timelapse.update({ where: { id: rec.id }, data: { frames: rec.frames } });
            }
        } catch (e) {
            this.log.warn(`Timelapse frame failed: ${(e as Error).message}`);
        } finally {
            rec.capturing = false;
        }
    }

    private async finish(bridge: PrinterBridge): Promise<void> {
        const rec = this.recordings.get(bridge.id);
        if (!rec) return;
        this.recordings.delete(bridge.id);
        await this.capture(bridge).catch(() => undefined);
        rec.unsubscribe();
        if (rec.frames < 5) {
            this.log.log(`Timelapse discarded (${rec.frames} frames)`);
            await this.prisma.client.timelapse.delete({ where: { id: rec.id } }).catch(() => null);
            fs.rmSync(rec.dir, { recursive: true, force: true });
            return;
        }
        await this.render(rec.id, rec.dir, bridge.settings.timelapseFps);
    }

    private async render(id: string, dir: string, fps: number): Promise<void> {
        const frames = this.countFrames(dir);
        await this.prisma.client.timelapse.update({ where: { id }, data: { status: 'rendering', frames } });
        const out = this.videoPath(id);
        const input = path.join(dir, 'frames', '%05d.jpg');
        const last = fs
            .readdirSync(path.join(dir, 'frames'))
            .filter((f) => f.endsWith('.jpg'))
            .sort()
            .pop();
        if (last) fs.copyFileSync(path.join(dir, 'frames', last), this.posterPath(id));
        const args = (codec: string[]) => [
            '-y',
            '-loglevel',
            'error',
            '-framerate',
            String(fps),
            '-i',
            input,
            ...codec,
            '-pix_fmt',
            'yuv420p',
            '-vf',
            'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-movflags',
            '+faststart',
            out,
        ];
        let ok = await this.runFfmpeg(args(['-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast']));
        if (!ok) ok = await this.runFfmpeg(args(['-c:v', 'mpeg4', '-q:v', '4']));
        if (!ok) {
            await this.prisma.client.timelapse.update({ where: { id }, data: { status: 'error' } });
            this.log.warn(`Timelapse render failed (${id})`);
            return;
        }
        const size = fs.statSync(out).size;
        fs.rmSync(path.join(dir, 'frames'), { recursive: true, force: true });
        await this.prisma.client.timelapse.update({
            where: { id },
            data: { status: 'ready', frames, sizeBytes: size, durationSec: Math.round((frames / fps) * 10) / 10 },
        });
        this.log.log(`Timelapse ready: ${id} (${frames} frames, ${(size / 1024 / 1024).toFixed(1)} MB)`);
    }

    private runFfmpeg(args: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            let stderr = '';
            const proc = spawn(resolveFfmpeg(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
            proc.stderr.on('data', (c: Buffer) => {
                stderr = (stderr + c.toString()).slice(-1000);
            });
            proc.on('error', (e) => {
                this.log.warn(`ffmpeg: ${e.message}`);
                resolve(false);
            });
            proc.on('exit', (code) => {
                if (code !== 0) this.log.warn(`ffmpeg exit ${code}: ${stderr.trim()}`);
                resolve(code === 0);
            });
        });
    }

    async list(printerId?: string): Promise<TimelapseDto[]> {
        const rows = await this.prisma.client.timelapse.findMany({
            where: printerId ? { printerId } : undefined,
            orderBy: { createdAt: 'desc' },
        });
        return rows.map(toDto);
    }

    async get(id: string): Promise<TimelapseDto> {
        const row = await this.prisma.client.timelapse.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        return toDto(row);
    }

    async video(id: string): Promise<string> {
        const t = await this.get(id);
        if (t.status !== 'ready') throw new NotFoundException();
        return this.videoPath(id);
    }

    async poster(id: string): Promise<string> {
        await this.get(id);
        const p = this.posterPath(id);
        if (!fs.existsSync(p)) throw new NotFoundException();
        return p;
    }

    async remove(id: string): Promise<void> {
        const row = await this.prisma.client.timelapse.findUnique({ where: { id } });
        if (!row) throw new NotFoundException();
        for (const [printerId, rec] of this.recordings) {
            if (rec.id === id) {
                rec.unsubscribe();
                this.recordings.delete(printerId);
            }
        }
        await this.prisma.client.timelapse.delete({ where: { id } });
        fs.rmSync(this.dirFor(id), { recursive: true, force: true });
    }

    async totalBytes(): Promise<number> {
        const agg = await this.prisma.client.timelapse.aggregate({ _sum: { sizeBytes: true } });
        return agg._sum.sizeBytes ?? 0;
    }
}

function toDto(r: Timelapse): TimelapseDto {
    return {
        id: r.id,
        printerId: r.printerId,
        jobId: r.jobId,
        filename: r.filename,
        frames: r.frames,
        sizeBytes: r.sizeBytes,
        durationSec: r.durationSec,
        status: r.status as TimelapseDto['status'],
        createdAt: r.createdAt.toISOString(),
    };
}
