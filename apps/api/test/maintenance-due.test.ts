import { describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import { MaintenanceService, toDto } from '../src/maintenance/maintenance.service';
import type { NotificationService } from '../src/notifications/notification.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function harness(jobs: number, durationSec: number) {
    const task = {
        id: 't1',
        printerId: 'p1',
        name: 'Clean the nozzle',
        note: '',
        intervalHours: 0,
        intervalJobs: 2,
        intervalDays: 0,
        lastDoneAt: null as Date | null,
        dueNotifiedAt: null as Date | null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const prisma = {
        client: {
            maintenanceTask: {
                findMany: mock(async () => [task]),
                findUnique: mock(async () => task),
                update: mock(async ({ data }: { data: Partial<typeof task> }) => Object.assign(task, data)),
            },
            printJob: {
                aggregate: mock(async () => ({ _sum: { durationSec }, _count: { _all: jobs } })),
                findFirst: mock(async () => null),
            },
        },
    } as unknown as PrismaService;
    const notifications = { emitCustom: mock(() => undefined) } as unknown as NotificationService;
    const service = new MaintenanceService(prisma, notifications);
    const bridge = Object.assign(new EventEmitter(), {
        id: 'p1',
        config: { name: 'Kobra' },
    }) as unknown as PrinterBridge;
    service.attach(bridge);
    return { service, notifications, task, detach: () => service.detach('p1') };
}

describe('maintenance due notifications', () => {
    it('notifies once when a task becomes due and resets after completion', async () => {
        const h = harness(3, 7200);
        await h.service.checkDue('p1');
        expect(h.notifications.emitCustom).toHaveBeenCalledWith('p1', 'Kobra', 'maintenance_due', {
            task: 'Clean the nozzle',
            presetKey: expect.any(String),
            hours: 2,
            jobs: 3,
        });
        await h.service.checkDue('p1');
        expect(h.notifications.emitCustom).toHaveBeenCalledTimes(1);
        expect(h.task.dueNotifiedAt).not.toBeNull();
        h.detach();
    });

    it('stays silent below the interval', async () => {
        const h = harness(1, 600);
        await h.service.checkDue('p1');
        expect(h.notifications.emitCustom).not.toHaveBeenCalled();
        h.detach();
    });

    it('computes progress and due from the usage', () => {
        const dto = toDto(
            {
                id: 't',
                printerId: 'p',
                name: 'Lube',
                note: '',
                intervalHours: 100,
                intervalJobs: 0,
                intervalDays: 0,
                lastDoneAt: null,
                dueNotifiedAt: null,
                createdAt: new Date(),
            },
            { hours: 25, jobs: 4, days: 2 },
        );
        expect(dto.progress).toBe(0.25);
        expect(dto.due).toBe(false);
        expect(dto.lastDoneAt).toBeNull();
    });
});
