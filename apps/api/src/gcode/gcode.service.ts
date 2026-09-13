import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseGcodeMetadata } from '@kobralink/kobra-protocol';
import type { GcodeFilament, GcodeFileDto, PrintJobDto } from '@kobralink/shared';
import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '../config/env';
import type { GcodeFile, PrintJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface StoredFile extends GcodeFileDto {
    path: string;
}

const ALLOWED_EXT = ['.gcode', '.bgcode'];

@Injectable()
export class GcodeService {
    private readonly log = new Logger(GcodeService.name);
    private readonly dir = loadEnv().gcodeDir;

    constructor(private readonly prisma: PrismaService) {}

    static isAllowedFilename(name: string): boolean {
        const lower = name.toLowerCase();
        return ALLOWED_EXT.some((e) => lower.endsWith(e));
    }

    static safeName(name: string): string {
        return path.basename(name).replace(/[\\/:*?"<>|]/g, '_');
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
                webUnverified,
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
                webUnverified,
                createdAt: new Date(),
            },
        });
        this.log.log(`Fichier stocké: ${safe} (${data.length} o) md5=${md5}`);
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

    async startJob(printerId: string, filename: string, fileId: string | null): Promise<string> {
        const job = await this.prisma.client.printJob.create({
            data: { printerId, filename, fileId, status: 'printing' },
        });
        return job.id;
    }

    async finishJob(jobId: string, status: 'completed' | 'cancelled' | 'error'): Promise<void> {
        const job = await this.prisma.client.printJob.findUnique({ where: { id: jobId } });
        if (!job) return;
        const now = new Date();
        await this.prisma.client.printJob.update({
            where: { id: jobId },
            data: {
                status,
                finishedAt: now,
                durationSec: Math.max(0, Math.round((now.getTime() - job.startedAt.getTime()) / 1000)),
            },
        });
    }

    async listJobs(printerId: string | undefined, limit = 50, offset = 0): Promise<PrintJobDto[]> {
        const rows = await this.prisma.client.printJob.findMany({
            where: printerId ? { printerId } : undefined,
            orderBy: { startedAt: 'desc' },
            take: limit,
            skip: offset,
        });
        return rows.map(toJobDto);
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

function toJobDto(j: PrintJob): PrintJobDto {
    return {
        id: j.id,
        printerId: j.printerId,
        fileId: j.fileId,
        filename: j.filename,
        status: j.status as PrintJobDto['status'],
        startedAt: j.startedAt.toISOString(),
        finishedAt: j.finishedAt?.toISOString() ?? null,
        durationSec: j.durationSec,
    };
}
