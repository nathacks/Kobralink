import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractFilamentInfo, extractPrintTarget, parseGcodeMetadata } from '@kobralink/kobra-protocol';
import type { GcodeFilament, GcodeFileDto, PrintJobDto, SpoolUsageEntry, UpdatePrintJobInput } from '@kobralink/shared';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { loadEnv } from '../config/env';
import type { GcodeFile, PrintJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface StoredFile extends GcodeFileDto {
    path: string;
}

const ALLOWED_EXT = ['.gcode', '.bgcode'];
const MAX_NAME_BYTES = 200;
export const META_VERSION = 2;

@Injectable()
export class GcodeService implements OnApplicationBootstrap {
    private readonly log = new Logger(GcodeService.name);
    private readonly dir = loadEnv().gcodeDir;
    private readonly failuresDir = path.join(loadEnv().dataDir, 'failures');

    constructor(private readonly prisma: PrismaService) {}

    onApplicationBootstrap(): void {
        void this.backfillFilamentUsage()
            .then(() => this.backfillTargets())
            .catch((e) => this.log.warn(`File metadata backfill: ${(e as Error).message}`));
    }

    async backfillFilamentUsage(): Promise<number> {
        const rows = await this.prisma.client.gcodeFile.findMany({
            select: { id: true, filename: true, filaments: true },
        });
        let updated = 0;
        for (const row of rows) {
            let list: GcodeFilament[] = [];
            try {
                list = JSON.parse(row.filaments);
            } catch {
                list = [];
            }
            if (!Array.isArray(list) || !list.length || list.every((f) => 'usedMm' in f)) continue;
            const data = await fs.promises.readFile(this.filePath(row.id, row.filename)).catch(() => null);
            if (!data) continue;
            const fresh = extractFilamentInfo(data);
            if (!fresh.length) continue;
            await this.prisma.client.gcodeFile.update({
                where: { id: row.id },
                data: { filaments: JSON.stringify(fresh) },
            });
            updated += 1;
        }
        if (updated) this.log.log(`Filament usage read from ${updated} stored file(s)`);
        return updated;
    }

    async backfillTargets(): Promise<number> {
        const rows = await this.prisma.client.gcodeFile.findMany({
            where: { metaVersion: { lt: META_VERSION } },
            select: { id: true, filename: true },
        });
        let updated = 0;
        for (const row of rows) {
            const data = await fs.promises.readFile(this.filePath(row.id, row.filename)).catch(() => null);
            if (!data) continue;
            await this.prisma.client.gcodeFile.update({
                where: { id: row.id },
                data: { ...extractPrintTarget(data), metaVersion: META_VERSION },
            });
            updated += 1;
        }
        if (updated) this.log.log(`Print target read again from ${updated} stored file(s)`);
        return updated;
    }

    static isAllowedFilename(name: string): boolean {
        const lower = name.toLowerCase();
        return ALLOWED_EXT.some((e) => lower.endsWith(e));
    }

    static safeName(name: string): string {
        const safe = path.basename(name).replace(/[\\/:*?"<>|]/g, '_');
        const ext = path.extname(safe);
        let stem = safe.slice(0, safe.length - ext.length);
        while (stem && Buffer.byteLength(stem + ext) > MAX_NAME_BYTES) stem = [...stem].slice(0, -1).join('');
        return stem + ext;
    }

    filePath(id: string, filename: string): string {
        return path.join(this.dir, `${id}__${GcodeService.safeName(filename)}`);
    }

    async save(printerId: string | null, filename: string, data: Buffer, webUnverified = false): Promise<StoredFile> {
        const safe = GcodeService.safeName(filename);
        const md5 = createHash('md5').update(data).digest('hex');
        const meta = parseGcodeMetadata(data);
        const target = this.filePath(md5, safe);
        await fs.promises.writeFile(target, data);

        const row = await this.prisma.client.gcodeFile.upsert({
            where: { id: md5 },
            create: {
                id: md5,
                printerId,
                filename: safe,
                sizeBytes: data.length,
                md5,
                estPrintTimeSec: meta.estimatedTimeSec,
                layerHeight: meta.layerHeight,
                firstLayerHeight: meta.firstLayerHeight,
                thumbnail: meta.thumbnailB64 || null,
                filaments: JSON.stringify(meta.filaments),
                objects: JSON.stringify(meta.objects),
                webUnverified,
                ...meta.target,
                metaVersion: META_VERSION,
            },
            update: {
                printerId: printerId ?? undefined,
                filename: safe,
                sizeBytes: data.length,
                estPrintTimeSec: meta.estimatedTimeSec,
                layerHeight: meta.layerHeight,
                firstLayerHeight: meta.firstLayerHeight,
                thumbnail: meta.thumbnailB64 || null,
                filaments: JSON.stringify(meta.filaments),
                ...(meta.objects.length ? { objects: JSON.stringify(meta.objects) } : {}),
                webUnverified,
                ...meta.target,
                metaVersion: META_VERSION,
                createdAt: new Date(),
            },
        });
        this.log.log(`File stored: ${safe} (${data.length} B) md5=${md5}`);
        return this.toDto(row, null);
    }

    async list(printerId?: string): Promise<GcodeFileDto[]> {
        const rows = await this.prisma.client.gcodeFile.findMany({
            where: printerId ? { OR: [{ printerId }, { printerId: null }] } : undefined,
            orderBy: { createdAt: 'desc' },
            include: { jobs: { orderBy: { startedAt: 'desc' }, take: 1 } },
        });
        return rows.map((r) => this.toDto(r, r.jobs[0] ?? null));
    }

    async get(id: string): Promise<StoredFile | null> {
        const row = await this.prisma.client.gcodeFile.findUnique({
            where: { id },
            include: { jobs: { orderBy: { startedAt: 'desc' }, take: 1 } },
        });
        return row ? this.toDto(row, row.jobs[0] ?? null) : null;
    }

    async getByFilename(filename: string): Promise<StoredFile | null> {
        const row = await this.prisma.client.gcodeFile.findFirst({
            where: { filename: GcodeService.safeName(filename) },
            orderBy: { createdAt: 'desc' },
            include: { jobs: { orderBy: { startedAt: 'desc' }, take: 1 } },
        });
        return row ? this.toDto(row, row.jobs[0] ?? null) : null;
    }

    async updateObjects(filename: string, objects: string[], svg: string): Promise<void> {
        const safe = GcodeService.safeName(filename);
        const row = await this.prisma.client.gcodeFile.findFirst({
            where: { filename: safe },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });
        if (!row) return;
        await this.prisma.client.gcodeFile.update({
            where: { id: row.id },
            data: { objects: JSON.stringify(objects), ...(svg ? { svgImage: svg } : {}) },
        });
    }

    async objects(id: string): Promise<{ names: string[]; svgB64: string; filename: string } | null> {
        const row = await this.prisma.client.gcodeFile.findUnique({
            where: { id },
            select: { filename: true, objects: true, svgImage: true },
        });
        if (!row) return null;
        return { names: parseList(row.objects), svgB64: row.svgImage ?? '', filename: row.filename };
    }

    async readData(id: string): Promise<{ file: StoredFile; data: Buffer } | null> {
        const file = await this.get(id);
        if (!file) return null;
        try {
            return { file, data: await fs.promises.readFile(file.path) };
        } catch {
            return null;
        }
    }

    async delete(id: string): Promise<boolean> {
        const row = await this.prisma.client.gcodeFile.findUnique({ where: { id } });
        if (!row) return false;
        await this.prisma.client.gcodeFile.delete({ where: { id } });
        await fs.promises.rm(this.filePath(row.id, row.filename), { force: true });
        return true;
    }

    async clearWebUnverified(id: string): Promise<boolean> {
        const r = await this.prisma.client.gcodeFile.updateMany({
            where: { id },
            data: { webUnverified: false },
        });
        return r.count > 0;
    }

    async startJob(
        printerId: string,
        filename: string,
        fileId: string | null,
        estimatedSec = 0,
        startedAt?: Date,
    ): Promise<string> {
        await this.closeOpenJobs(printerId, 'error');
        const job = await this.prisma.client.printJob.create({
            data: {
                printerId,
                filename,
                fileId,
                status: 'printing',
                estimatedSec: Math.max(0, Math.round(estimatedSec)),
                ...(startedAt ? { startedAt } : {}),
            },
        });
        return job.id;
    }

    async findOpenJob(printerId: string): Promise<PrintJob | null> {
        return this.prisma.client.printJob.findFirst({
            where: { printerId, status: 'printing' },
            orderBy: { startedAt: 'desc' },
        });
    }

    async finishJob(
        jobId: string,
        status: 'completed' | 'cancelled' | 'error',
        filamentMm = 0,
        spoolUsage: SpoolUsageEntry[] = [],
        printDurationSec: number | null = null,
        failure: {
            errorCode?: number;
            errorMsg?: string;
            snapshot?: Buffer | null;
            pausedAt?: Date | null;
            failureReason?: string;
        } = {},
    ): Promise<void> {
        const job = await this.prisma.client.printJob.findUnique({ where: { id: jobId } });
        if (!job) return;
        const now = new Date();
        const wallSec = Math.max(0, Math.round((now.getTime() - job.startedAt.getTime()) / 1000));
        const durationSec = printDurationSec === null ? wallSec : Math.max(0, Math.round(printDurationSec));
        const snapshot = status === 'completed' ? null : await this.saveSnapshot(jobId, failure.snapshot ?? null);
        await this.prisma.client.printJob.update({
            where: { id: jobId },
            data: {
                status,
                finishedAt: now,
                durationSec,
                filamentMm: Math.max(0, Math.round(filamentMm)),
                spoolUsage: JSON.stringify(spoolUsage),
                usageState: '',
                errorCode: status === 'completed' ? 0 : Math.max(0, Math.round(failure.errorCode ?? 0)),
                errorMsg: status === 'completed' ? '' : (failure.errorMsg ?? '').slice(0, 500),
                ...(snapshot ? { snapshot } : {}),
                ...(failure.pausedAt !== undefined ? { pausedAt: failure.pausedAt } : {}),
                ...(status !== 'completed' && failure.failureReason ? { failureReason: failure.failureReason } : {}),
            },
        });
    }

    private async saveSnapshot(jobId: string, data: Buffer | null): Promise<string | null> {
        if (!data?.length) return null;
        try {
            await fs.promises.mkdir(this.failuresDir, { recursive: true });
            const name = `${jobId}.jpg`;
            await fs.promises.writeFile(path.join(this.failuresDir, name), data);
            return name;
        } catch (e) {
            this.log.warn(`Failure snapshot not saved: ${(e as Error).message}`);
            return null;
        }
    }

    async snapshotPath(printerId: string, jobId: string): Promise<string | null> {
        const job = await this.prisma.client.printJob.findFirst({ where: { id: jobId, printerId } });
        if (!job?.snapshot) return null;
        const file = path.join(this.failuresDir, path.basename(job.snapshot));
        return fs.existsSync(file) ? file : null;
    }

    async updateJob(printerId: string, jobId: string, patch: UpdatePrintJobInput): Promise<PrintJobDto | null> {
        const job = await this.prisma.client.printJob.findFirst({ where: { id: jobId, printerId } });
        if (!job) return null;
        const row = await this.prisma.client.printJob.update({
            where: { id: jobId },
            data: {
                ...(patch.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
                ...(patch.note !== undefined ? { note: patch.note } : {}),
            },
            include: { file: { select: { thumbnail: true } } },
        });
        return toJobDto(row, row.file?.thumbnail ?? null);
    }

    async setJobPaused(jobId: string, pausedAt: Date | null): Promise<void> {
        await this.prisma.client.printJob.updateMany({ where: { id: jobId, status: 'printing' }, data: { pausedAt } });
    }

    async saveUsageState(jobId: string, usageState: string): Promise<void> {
        await this.prisma.client.printJob.updateMany({
            where: { id: jobId, status: 'printing' },
            data: { usageState },
        });
    }

    async closeOpenJobs(printerId: string, status: 'completed' | 'cancelled' | 'error'): Promise<number> {
        const open = await this.prisma.client.printJob.findMany({ where: { printerId, status: 'printing' } });
        const now = new Date();
        for (const job of open) {
            await this.prisma.client.printJob.update({
                where: { id: job.id },
                data: {
                    status,
                    finishedAt: now,
                    durationSec: Math.max(0, Math.round((now.getTime() - job.startedAt.getTime()) / 1000)),
                },
            });
        }
        return open.length;
    }

    async listJobs(printerId: string | undefined, limit = 50, offset = 0): Promise<PrintJobDto[]> {
        const rows = await this.prisma.client.printJob.findMany({
            where: printerId ? { printerId } : undefined,
            orderBy: { startedAt: 'desc' },
            take: limit,
            skip: offset,
            include: { file: { select: { thumbnail: true } } },
        });
        return rows.map((r) => toJobDto(r, r.file?.thumbnail ?? null));
    }

    private toDto(row: GcodeFile, lastJob: PrintJob | null): StoredFile {
        let filaments: GcodeFilament[] = [];
        try {
            filaments = JSON.parse(row.filaments);
        } catch {
            filaments = [];
        }
        return {
            id: row.id,
            printerId: row.printerId,
            filename: row.filename,
            sizeBytes: row.sizeBytes,
            md5: row.md5,
            estPrintTimeSec: row.estPrintTimeSec,
            layerHeight: row.layerHeight,
            firstLayerHeight: row.firstLayerHeight,
            thumbnail: row.thumbnail,
            filaments,
            objects: parseList(row.objects),
            hasSvg: Boolean(row.svgImage),
            webUnverified: row.webUnverified,
            createdAt: row.createdAt.toISOString(),
            lastJob: lastJob
                ? {
                      status: lastJob.status,
                      startedAt: lastJob.startedAt.toISOString(),
                      durationSec: lastJob.durationSec,
                  }
                : null,
            path: this.filePath(row.id, row.filename),
        };
    }
}

export function toJobDto(j: PrintJob, thumbnail: string | null = null): PrintJobDto {
    let spoolUsage: SpoolUsageEntry[] = [];
    try {
        const v = JSON.parse(j.spoolUsage);
        if (Array.isArray(v)) spoolUsage = v;
    } catch {
        spoolUsage = [];
    }
    return {
        id: j.id,
        printerId: j.printerId,
        fileId: j.fileId,
        filename: j.filename,
        status: j.status as PrintJobDto['status'],
        startedAt: j.startedAt.toISOString(),
        finishedAt: j.finishedAt?.toISOString() ?? null,
        durationSec: j.durationSec,
        estimatedSec: j.estimatedSec,
        filamentMm: j.filamentMm,
        spoolUsage,
        thumbnail,
        errorCode: j.errorCode,
        errorMsg: j.errorMsg,
        failureReason: j.failureReason as PrintJobDto['failureReason'],
        note: j.note,
        hasSnapshot: Boolean(j.snapshot),
        pausedAt: j.pausedAt?.toISOString() ?? null,
        energyKwh: j.energyKwh ?? null,
        cost: null,
    };
}

function parseList(raw: string): string[] {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}
