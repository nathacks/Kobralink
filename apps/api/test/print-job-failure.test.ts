import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/config/env';
import { GcodeService, toJobDto } from '../src/gcode/gcode.service';
import { seedPrinter, type TestDb, testDb } from './helpers/db';

let db: TestDb;
let svc: GcodeService;
const failuresDir = path.join(loadEnv().dataDir, 'failures');

beforeAll(async () => {
    db = await testDb();
    await seedPrinter(db.client, 'p1');
    svc = new GcodeService(db.prisma);
});

afterAll(() => db.close());

describe('finishJob', () => {
    it('keeps the printer error and the camera frame of a failed job', async () => {
        const id = await svc.startJob('p1', 'part.gcode', null, 600);
        await svc.finishJob(id, 'error', 1234.6, [], 0, {
            errorCode: 20001,
            errorMsg: 'x'.repeat(600),
            snapshot: Buffer.from('jpeg-bytes'),
        });
        const row = await db.client.printJob.findUniqueOrThrow({ where: { id } });
        expect(row.status).toBe('error');
        expect(row.errorCode).toBe(20001);
        expect(row.errorMsg).toHaveLength(500);
        expect(row.filamentMm).toBe(1235);
        expect(row.snapshot).toBe(`${id}.jpg`);
        expect(fs.readFileSync(path.join(failuresDir, `${id}.jpg`), 'utf8')).toBe('jpeg-bytes');
        expect(await svc.snapshotPath('p1', id)).toBe(path.join(failuresDir, `${id}.jpg`));
        expect(await svc.snapshotPath('p2', id)).toBeNull();
    });

    it('drops the error and the frame of a completed job', async () => {
        const id = await svc.startJob('p1', 'ok.gcode', null, 600);
        await svc.finishJob(id, 'completed', 0, [], 100, {
            errorCode: 5,
            errorMsg: 'stale',
            snapshot: Buffer.from('frame'),
        });
        const row = await db.client.printJob.findUniqueOrThrow({ where: { id } });
        expect(row.errorCode).toBe(0);
        expect(row.errorMsg).toBe('');
        expect(row.snapshot).toBeNull();
        expect(row.durationSec).toBe(100);
        expect(await svc.snapshotPath('p1', id)).toBeNull();
    });

    it('stores no snapshot when the frame is empty or missing', async () => {
        const a = await svc.startJob('p1', 'a.gcode', null);
        await svc.finishJob(a, 'cancelled', 0, [], 10, { snapshot: Buffer.alloc(0) });
        const b = await svc.startJob('p1', 'b.gcode', null);
        await svc.finishJob(b, 'cancelled', 0, [], 10, {});
        const rows = await db.client.printJob.findMany({ where: { id: { in: [a, b] } } });
        expect(rows.map((r) => r.snapshot)).toEqual([null, null]);
        expect(rows.map((r) => r.errorCode)).toEqual([0, 0]);
    });

    it('falls back to the wall clock when the printer reported no duration', async () => {
        const id = await svc.startJob('p1', 'wall.gcode', null, 0, new Date(Date.now() - 90_000));
        await svc.finishJob(id, 'cancelled');
        const row = await db.client.printJob.findUniqueOrThrow({ where: { id } });
        expect(row.durationSec).toBeGreaterThanOrEqual(89);
        expect(row.durationSec).toBeLessThanOrEqual(92);
    });

    it('keeps the reason given when cancelling, never on a completed job', async () => {
        const cancelled = await svc.startJob('p1', 'why.gcode', null);
        await svc.finishJob(cancelled, 'cancelled', 0, [], 10, { failureReason: 'adhesion' });
        const completed = await svc.startJob('p1', 'fine.gcode', null);
        await svc.finishJob(completed, 'completed', 0, [], 10, { failureReason: 'adhesion' });
        const rows = await db.client.printJob.findMany({ where: { id: { in: [cancelled, completed] } } });
        const reason = (id: string) => rows.find((r) => r.id === id)?.failureReason;
        expect(reason(cancelled)).toBe('adhesion');
        expect(reason(completed)).toBe('');
    });

    it('ignores unknown jobs', async () => {
        await expect(svc.finishJob('missing', 'error')).resolves.toBeUndefined();
    });

    it('closes jobs left open when a new one starts', async () => {
        const stale = await svc.startJob('p1', 'stale.gcode', null);
        const fresh = await svc.startJob('p1', 'fresh.gcode', null);
        const row = await db.client.printJob.findUniqueOrThrow({ where: { id: stale } });
        expect(row.status).toBe('error');
        expect((await svc.findOpenJob('p1'))?.id).toBe(fresh);
    });
});

describe('updateJob', () => {
    it('labels a failure with a reason and a note', async () => {
        const id = await svc.startJob('p1', 'label.gcode', null);
        await svc.finishJob(id, 'cancelled', 0, [], 10, { snapshot: Buffer.from('f') });
        const dto = await svc.updateJob('p1', id, { failureReason: 'spaghetti', note: 'support failed' });
        expect(dto).toMatchObject({
            id,
            failureReason: 'spaghetti',
            note: 'support failed',
            hasSnapshot: true,
            cost: null,
        });
        const partial = await svc.updateJob('p1', id, { note: 'edited' });
        expect(partial?.failureReason).toBe('spaghetti');
        expect(partial?.note).toBe('edited');
        const cleared = await svc.updateJob('p1', id, { failureReason: '' });
        expect(cleared?.failureReason).toBe('');
    });

    it('returns null for a job of another printer', async () => {
        const id = await svc.startJob('p1', 'other.gcode', null);
        expect(await svc.updateJob('p2', id, { note: 'x' })).toBeNull();
    });
});

describe('toJobDto', () => {
    it('tolerates a broken spool usage payload and exposes the failure fields', () => {
        const dto = toJobDto(
            {
                id: 'j',
                printerId: 'p1',
                fileId: null,
                filename: 'x.gcode',
                status: 'error',
                startedAt: new Date('2026-10-01T10:00:00Z'),
                finishedAt: null,
                durationSec: null,
                estimatedSec: 0,
                filamentMm: 0,
                spoolUsage: '{not json',
                errorCode: 7,
                errorMsg: 'runout',
                failureReason: 'filament_runout',
                note: '',
                snapshot: null,
                pausedAt: new Date('2026-10-01T10:30:00Z'),
            },
            'thumb',
        );
        expect(dto.spoolUsage).toEqual([]);
        expect(dto.thumbnail).toBe('thumb');
        expect(dto.finishedAt).toBeNull();
        expect(dto).toMatchObject({ errorCode: 7, errorMsg: 'runout', failureReason: 'filament_runout' });
        expect(dto.hasSnapshot).toBe(false);
        expect(dto.pausedAt).toBe('2026-10-01T10:30:00.000Z');
    });
});

describe('job pause time', () => {
    it('records and clears the pause of a running job', async () => {
        const id = await svc.startJob('p1', 'paused.gcode', null);
        const at = new Date('2026-10-30T08:00:00Z');
        await svc.setJobPaused(id, at);
        expect((await db.client.printJob.findUniqueOrThrow({ where: { id } })).pausedAt).toEqual(at);
        await svc.setJobPaused(id, null);
        expect((await db.client.printJob.findUniqueOrThrow({ where: { id } })).pausedAt).toBeNull();
    });

    it('never rewrites the pause of a job that already ended', async () => {
        const id = await svc.startJob('p1', 'ended.gcode', null);
        await svc.finishJob(id, 'cancelled', 0, [], 10, {});
        await svc.setJobPaused(id, new Date());
        expect((await db.client.printJob.findUniqueOrThrow({ where: { id } })).pausedAt).toBeNull();
    });

    it('stores the pause the job ended with', async () => {
        const at = new Date('2026-10-30T09:00:00Z');
        const paused = await svc.startJob('p1', 'left-paused.gcode', null);
        await svc.finishJob(paused, 'cancelled', 500, [], 60, { pausedAt: at });
        const resumed = await svc.startJob('p1', 'resumed.gcode', null);
        await svc.setJobPaused(resumed, at);
        await svc.finishJob(resumed, 'cancelled', 500, [], 60, { pausedAt: null });
        const rows = await db.client.printJob.findMany({ where: { id: { in: [paused, resumed] } } });
        const byId = new Map(rows.map((r) => [r.id, r.pausedAt]));
        expect(byId.get(paused)).toEqual(at);
        expect(byId.get(resumed)).toBeNull();
    });

    it('keeps the stored pause when the job is closed without one', async () => {
        const at = new Date('2026-10-30T10:00:00Z');
        const id = await svc.startJob('p1', 'offline.gcode', null);
        await svc.setJobPaused(id, at);
        await svc.finishJob(id, 'error', 0, [], 0, {});
        expect((await db.client.printJob.findUniqueOrThrow({ where: { id } })).pausedAt).toEqual(at);
    });

    it('keeps the pause of jobs closed after Kobralink was offline', async () => {
        await db.client.printJob.updateMany({
            where: { printerId: 'p1', status: 'printing' },
            data: { status: 'cancelled' },
        });
        const at = new Date('2026-10-30T11:00:00Z');
        const id = await svc.startJob('p1', 'abandoned.gcode', null);
        await svc.setJobPaused(id, at);
        expect(await svc.closeOpenJobs('p1', 'cancelled')).toBe(1);
        const row = await db.client.printJob.findUniqueOrThrow({ where: { id } });
        expect(row.status).toBe('cancelled');
        expect(row.pausedAt).toEqual(at);
    });
});

describe('finishJob duration', () => {
    it('keeps a zero print time and uses the wall clock only when the time is unknown', async () => {
        const zero = await svc.startJob('p1', 'calibration.gcode', null);
        await svc.finishJob(zero, 'cancelled', 0, [], 0, {});
        const unknown = await svc.startJob('p1', 'no-clock.gcode', null);
        await svc.finishJob(unknown, 'completed', 0, [], null, {});
        const rows = await db.client.printJob.findMany({ where: { id: { in: [zero, unknown] } } });
        const byId = new Map(rows.map((r) => [r.id, r.durationSec]));
        expect(byId.get(zero)).toBe(0);
        expect(byId.get(unknown)).toBeGreaterThanOrEqual(0);
        expect(byId.get(unknown)).not.toBeNull();
    });
});
