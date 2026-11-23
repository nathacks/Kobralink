import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { NotFoundException } from '@nestjs/common';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import { MaintenanceService } from '../src/maintenance/maintenance.service';
import type { NotificationService } from '../src/notifications/notification.service';
import { seedJob, seedPrinter, type TestDb, testDb } from './helpers/db';

let db: TestDb;
let svc: MaintenanceService;
const emitCustom = mock(() => undefined);
const notifications = { emitCustom } as unknown as NotificationService;
const after = async () => {
    await new Promise((r) => setTimeout(r, 5));
    return new Date();
};

beforeAll(async () => {
    db = await testDb();
    await seedPrinter(db.client, 'p1', 'Kobra');
    await seedPrinter(db.client, 'p2');
    svc = new MaintenanceService(db.prisma, notifications);
});

afterAll(() => db.close());

describe('maintenance tasks', () => {
    it('creates a task with default intervals and no usage yet', async () => {
        const task = await svc.create('p1', { name: 'Clean the bed' });
        expect(task).toMatchObject({
            printerId: 'p1',
            name: 'Clean the bed',
            note: '',
            intervalHours: 0,
            intervalJobs: 0,
            intervalDays: 0,
            lastDoneAt: null,
            usage: { hours: 0, jobs: 0, days: 0 },
            progress: 0,
            due: false,
        });
        await svc.remove('p1', task.id);
    });

    it('computes the usage from the jobs since the creation and sorts by progress', async () => {
        const byJobs = await svc.create('p1', { name: 'Nozzle', intervalJobs: 2 });
        const byHours = await svc.create('p1', { name: 'Axes', intervalHours: 100, note: 'PTFE grease' });
        for (let i = 0; i < 3; i++) await seedJob(db.client, 'p1', { durationSec: 3600, startedAt: await after() });
        await seedJob(db.client, 'p1', { status: 'printing', durationSec: 0, startedAt: await after() });
        const list = await svc.list('p1');
        expect(list.map((t) => t.name)).toEqual(['Nozzle', 'Axes']);
        expect(list[0]).toMatchObject({ usage: { hours: 3, jobs: 3, days: 0 }, progress: 1.5, due: true });
        expect(list[1]).toMatchObject({ usage: { hours: 3, jobs: 3, days: 0 }, progress: 0.03, due: false });
        expect(await svc.list('p2')).toEqual([]);
        await svc.remove('p1', byJobs.id);
        await svc.remove('p1', byHours.id);
        await db.client.printJob.deleteMany({ where: { printerId: 'p1' } });
    });

    it('updates a task and forgets that it was notified', async () => {
        const task = await svc.create('p1', { name: 'Belts', intervalDays: 30 });
        await db.client.maintenanceTask.update({ where: { id: task.id }, data: { dueNotifiedAt: new Date() } });
        const next = await svc.update('p1', task.id, { name: 'Belts and pulleys', intervalDays: 60, note: 'n' });
        expect(next).toMatchObject({ name: 'Belts and pulleys', intervalDays: 60, intervalHours: 0, note: 'n' });
        const row = await db.client.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } });
        expect(row.dueNotifiedAt).toBeNull();
        await svc.remove('p1', task.id);
    });

    it('completes a task with a log entry and restarts the usage', async () => {
        const task = await svc.create('p1', { name: 'Fans', intervalJobs: 1 });
        await seedJob(db.client, 'p1', { durationSec: 7200, startedAt: await after() });
        expect((await svc.list('p1'))[0].due).toBe(true);
        const done = await svc.complete('p1', task.id, { note: 'dusted' });
        expect(done.lastDoneAt).not.toBeNull();
        expect(done.usage).toEqual({ hours: 0, jobs: 0, days: 0 });
        expect(done.due).toBe(false);
        const logs = await svc.logs('p1', task.id);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ taskId: task.id, note: 'dusted', hours: 2, jobs: 1 });
        const listed = (await svc.list('p1')).find((t) => t.id === task.id);
        expect(listed?.usage.jobs).toBe(0);
        expect(listed?.due).toBe(false);
        await svc.remove('p1', task.id);
        await db.client.printJob.deleteMany({ where: { printerId: 'p1' } });
    });

    it('lists the log newest first and honours the limit', async () => {
        const task = await svc.create('p1', { name: 'Lube' });
        for (const note of ['first', 'second', 'third']) {
            await svc.complete('p1', task.id, { note });
            await new Promise((r) => setTimeout(r, 5));
        }
        expect((await svc.logs('p1', task.id)).map((l) => l.note)).toEqual(['third', 'second', 'first']);
        expect(await svc.logs('p1', task.id, 2)).toHaveLength(2);
        await svc.remove('p1', task.id);
        expect(await db.client.maintenanceLog.count({ where: { taskId: task.id } })).toBe(0);
    });

    it('refuses tasks of another printer', async () => {
        const task = await svc.create('p1', { name: 'Private' });
        await expect(svc.update('p2', task.id, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.complete('p2', task.id, {})).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.logs('p2', task.id)).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.remove('p2', task.id)).rejects.toBeInstanceOf(NotFoundException);
        await svc.remove('p1', task.id);
    });
});

describe('maintenance due check', () => {
    it('notifies once, resets after completion and when the task is edited', async () => {
        const bridge = Object.assign(new EventEmitter(), {
            id: 'p1',
            config: { name: 'Kobra' },
        }) as unknown as PrinterBridge;
        svc.attach(bridge);
        expect(bridge.listenerCount('job')).toBe(1);
        const task = await svc.create('p1', { name: 'Nozzle', intervalJobs: 1 });
        await seedJob(db.client, 'p1', { durationSec: 1800, startedAt: await after() });
        emitCustom.mockClear();
        await svc.checkDue('p1');
        await svc.checkDue('p1');
        expect(emitCustom).toHaveBeenCalledTimes(1);
        expect(emitCustom).toHaveBeenCalledWith('p1', 'Kobra', 'maintenance_due', {
            task: 'Nozzle',
            presetKey: '',
            hours: 1,
            jobs: 1,
        });
        await svc.complete('p1', task.id, {});
        await svc.checkDue('p1');
        expect(emitCustom).toHaveBeenCalledTimes(1);
        await seedJob(db.client, 'p1', { durationSec: 60, startedAt: await after() });
        await svc.checkDue('p1');
        expect(emitCustom).toHaveBeenCalledTimes(2);
        svc.detach('p1');
        expect(bridge.listenerCount('job')).toBe(0);
        await svc.checkDue('p1');
        expect(emitCustom).toHaveBeenCalledTimes(2);
        await svc.remove('p1', task.id);
        await db.client.printJob.deleteMany({ where: { printerId: 'p1' } });
    });

    it('clears a stale notification flag when the task is no longer due', async () => {
        const bridge = Object.assign(new EventEmitter(), {
            id: 'p1',
            config: { name: 'Kobra' },
        }) as unknown as PrinterBridge;
        svc.attach(bridge);
        const task = await svc.create('p1', { name: 'Bed', intervalJobs: 5 });
        await db.client.maintenanceTask.update({ where: { id: task.id }, data: { dueNotifiedAt: new Date() } });
        await svc.checkDue('p1');
        const row = await db.client.maintenanceTask.findUniqueOrThrow({ where: { id: task.id } });
        expect(row.dueNotifiedAt).toBeNull();
        svc.detach('p1');
        await svc.remove('p1', task.id);
    });
});

describe('recommended tasks', () => {
    it('keep the recommendation they came from, and lose it when saved as a custom task', async () => {
        const task = await svc.create('p1', {
            name: 'Lubricate the axes',
            presetKey: 'lubricate_axes',
            intervalHours: 100,
        });
        expect(task.presetKey).toBe('lubricate_axes');
        const renamed = await svc.update('p1', task.id, { name: 'Grease the screws', intervalHours: 100 });
        expect(renamed.presetKey).toBe('');
        await svc.remove('p1', task.id);
    });
});
