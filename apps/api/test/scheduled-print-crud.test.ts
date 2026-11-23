import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { BridgeRegistry } from '../src/bridge/bridge.registry';
import type { NotificationService } from '../src/notifications/notification.service';
import type { QueueService } from '../src/queue/queue.service';
import { ScheduledPrintService } from '../src/schedule/scheduled-print.service';
import { seedFile, seedPrinter, type TestDb, testDb } from './helpers/db';

let db: TestDb;
const printStoredFile = mock(async () => ({}));
const emitCustom = mock(() => undefined);
const queueAdd = mock(async () => ({}));
let snapshot = { connected: true, printState: 'standby' };
const bridge = {
    id: 'p1',
    config: { name: 'Kobra', ip: '127.0.0.1', httpPort: 7125 },
    snapshot: () => snapshot,
    printStoredFile,
};
const registry = {
    get: (id: string) => {
        if (id !== 'p1') throw new NotFoundException();
        return bridge;
    },
} as unknown as BridgeRegistry;

function service() {
    return new ScheduledPrintService(
        db.prisma,
        registry,
        { add: queueAdd } as unknown as QueueService,
        { emitCustom } as unknown as NotificationService,
    );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
    db = await testDb();
    await seedPrinter(db.client, 'p1', 'Kobra');
    await seedFile(db.client, 'f1', 'bracket.gcode');
});

afterAll(() => db.close());

describe('scheduled prints', () => {
    it('stores the print options and lists by start time', async () => {
        const svc = service();
        const later = new Date(Date.now() + 3_600_000);
        const sooner = new Date(Date.now() + 1_800_000);
        const a = await svc.create('p1', {
            fileId: 'f1',
            startAt: later.toISOString(),
            excludedObjects: ['cube'],
            timelapse: true,
        });
        const b = await svc.create('p1', { fileId: 'f1', startAt: sooner.toISOString() });
        expect(a).toMatchObject({
            printerId: 'p1',
            fileId: 'f1',
            filename: 'bracket.gcode',
            estPrintTimeSec: 600,
            startAt: later.toISOString(),
            excludedObjects: ['cube'],
        });
        const row = await db.client.scheduledPrint.findUniqueOrThrow({ where: { id: a.id } });
        expect(JSON.parse(row.options)).toEqual({ excludedObjects: ['cube'], timelapse: true });
        expect((await svc.list('p1')).map((s) => s.id)).toEqual([b.id, a.id]);
        expect(await svc.list('p2')).toEqual([]);
        await svc.remove('p1', a.id);
        await svc.remove('p1', b.id);
        expect(await svc.list('p1')).toEqual([]);
    });

    it('rejects a start in the past, an unknown file and an unknown printer', async () => {
        const svc = service();
        const past = new Date(Date.now() - 120_000).toISOString();
        const future = new Date(Date.now() + 120_000).toISOString();
        await expect(svc.create('p1', { fileId: 'f1', startAt: past })).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.create('p1', { fileId: 'nope', startAt: future })).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.create('p2', { fileId: 'f1', startAt: future })).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.remove('p1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
        expect(await db.client.scheduledPrint.count()).toBe(0);
    });

    it('refuses to remove a schedule of another printer', async () => {
        const svc = service();
        const item = await svc.create('p1', { fileId: 'f1', startAt: new Date(Date.now() + 60_000).toISOString() });
        await expect(svc.remove('p2', item.id)).rejects.toBeInstanceOf(NotFoundException);
        await svc.remove('p1', item.id);
    });

    it('fires at the start time and removes the row', async () => {
        const svc = service();
        printStoredFile.mockClear();
        emitCustom.mockClear();
        snapshot = { connected: true, printState: 'standby' };
        const item = await svc.create('p1', {
            fileId: 'f1',
            startAt: new Date(Date.now() + 50).toISOString(),
            excludedObjects: ['lid'],
        });
        await sleep(250);
        expect(printStoredFile).toHaveBeenCalledTimes(1);
        const [fileId, opts] = printStoredFile.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(fileId).toBe('f1');
        expect(opts.excludedObjects).toEqual(['lid']);
        expect(emitCustom).toHaveBeenCalledWith('p1', 'Kobra', 'scheduled_print', {
            filename: 'bracket.gcode',
            result: 'started',
            error: '',
        });
        expect(await db.client.scheduledPrint.findUnique({ where: { id: item.id } })).toBeNull();
    });

    it('does not fire a schedule that was removed', async () => {
        const svc = service();
        printStoredFile.mockClear();
        const item = await svc.create('p1', { fileId: 'f1', startAt: new Date(Date.now() + 50).toISOString() });
        await svc.remove('p1', item.id);
        await sleep(200);
        expect(printStoredFile).not.toHaveBeenCalled();
    });

    it('re-arms recent schedules at boot and drops stale ones', async () => {
        printStoredFile.mockClear();
        queueAdd.mockClear();
        snapshot = { connected: true, printState: 'printing' };
        const recent = await db.client.scheduledPrint.create({
            data: { printerId: 'p1', fileId: 'f1', startAt: new Date(Date.now() - 5 * 60_000), options: '{}' },
        });
        const stale = await db.client.scheduledPrint.create({
            data: { printerId: 'p1', fileId: 'f1', startAt: new Date(Date.now() - 2 * 3_600_000), options: '{}' },
        });
        await service().onModuleInit();
        await sleep(250);
        expect(queueAdd).toHaveBeenCalledWith('f1', [], true, {}, { printerId: 'p1', targetTags: [] }, false);
        expect(printStoredFile).not.toHaveBeenCalled();
        expect(await db.client.scheduledPrint.findUnique({ where: { id: recent.id } })).toBeNull();
        expect(await db.client.scheduledPrint.findUnique({ where: { id: stale.id } })).toBeNull();
    });

    it('forgets a schedule whose printer no longer exists', async () => {
        const svc = service();
        emitCustom.mockClear();
        await seedPrinter(db.client, 'gone');
        const row = await db.client.scheduledPrint.create({
            data: { printerId: 'gone', fileId: 'f1', startAt: new Date(), options: '{}' },
        });
        await svc.fire(row.id);
        expect(emitCustom).not.toHaveBeenCalled();
        expect(await db.client.scheduledPrint.findUnique({ where: { id: row.id } })).toBeNull();
        await expect(svc.fire('missing')).resolves.toBeUndefined();
    });
});
