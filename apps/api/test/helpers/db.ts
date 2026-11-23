import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import type { PrismaClient as Client } from '../../src/generated/prisma/client';
import { PrismaClient } from '../../src/generated/prisma/client';
import { applyMigrations } from '../../src/prisma/migrator';
import type { PrismaService } from '../../src/prisma/prisma.service';

export const MIGRATIONS_DIR = path.resolve(import.meta.dir, '../../prisma/migrations');

export interface TestDb {
    client: Client;
    prisma: PrismaService;
    file: string;
    close: () => Promise<void>;
}

export async function testDb(): Promise<TestDb> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kobralink-db-'));
    const file = path.join(dir, 'test.db');
    await applyMigrations(`file:${file}`, MIGRATIONS_DIR, () => undefined);
    const client = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${file}` }) });
    return {
        client,
        prisma: { client } as unknown as PrismaService,
        file,
        close: async () => {
            await client.$disconnect();
            fs.rmSync(dir, { recursive: true, force: true });
        },
    };
}

let port = 17000;

export async function seedPrinter(client: Client, id: string, name = `Printer ${id}`) {
    port += 1;
    return client.printer.create({
        data: {
            id,
            name,
            ip: '127.0.0.1',
            username: 'test-user',
            password: 'test-pass',
            deviceId: `device-${id}`,
            httpPort: port,
        },
    });
}

export async function seedFile(client: Client, id: string, filename = `${id}.gcode`, printerId: string | null = null) {
    return client.gcodeFile.create({
        data: { id, printerId, filename, sizeBytes: 1024, md5: id, estPrintTimeSec: 600 },
    });
}

export async function seedJob(
    client: Client,
    printerId: string,
    data: Partial<{
        fileId: string | null;
        filename: string;
        status: string;
        startedAt: Date;
        durationSec: number;
        estimatedSec: number;
        filamentMm: number;
        spoolUsage: string;
        failureReason: string;
        errorCode: number;
        pausedAt: Date | null;
        finishedAt: Date | null;
        energyKwh: number | null;
    }> = {},
) {
    return client.printJob.create({
        data: {
            printerId,
            filename: data.filename ?? 'part.gcode',
            fileId: data.fileId ?? null,
            status: data.status ?? 'completed',
            startedAt: data.startedAt ?? new Date(),
            finishedAt: data.finishedAt === undefined ? new Date() : data.finishedAt,
            durationSec: data.durationSec ?? 3600,
            estimatedSec: data.estimatedSec ?? 0,
            filamentMm: data.filamentMm ?? 0,
            spoolUsage: data.spoolUsage ?? '[]',
            failureReason: data.failureReason ?? '',
            errorCode: data.errorCode ?? 0,
            pausedAt: data.pausedAt ?? null,
            energyKwh: data.energyKwh ?? null,
        },
    });
}
