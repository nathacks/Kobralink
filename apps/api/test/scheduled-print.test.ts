import { describe, expect, it, mock } from 'bun:test';
import type { BridgeRegistry } from '../src/bridge/bridge.registry';
import type { NotificationService } from '../src/notifications/notification.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { QueueService } from '../src/queue/queue.service';
import { parseOptions, ScheduledPrintService } from '../src/schedule/scheduled-print.service';

const row = {
    id: 's1',
    printerId: 'p1',
    fileId: 'f1',
    startAt: new Date(),
    options: JSON.stringify({ excludedObjects: ['cube'], timelapse: true }),
    createdAt: new Date(),
    file: { id: 'f1', filename: 'bracket.gcode', thumbnail: null, estPrintTimeSec: 600 },
};

function harness(snapshot: { connected: boolean; printState: string }) {
    const prisma = {
        client: {
            scheduledPrint: {
                findUnique: mock(async () => row),
                delete: mock(async () => row),
                findMany: mock(async () => []),
            },
        },
    } as unknown as PrismaService;
    const printStoredFile = mock(async () => ({}));
    const bridge = {
        id: 'p1',
        config: { name: 'Kobra', ip: '127.0.0.1', httpPort: 7125 },
        snapshot: () => snapshot,
        printStoredFile,
    };
    const registry = { get: () => bridge } as unknown as BridgeRegistry;
    const queue = { add: mock(async () => ({})) } as unknown as QueueService;
    const notifications = { emitCustom: mock(() => undefined) } as unknown as NotificationService;
    const service = new ScheduledPrintService(prisma, registry, queue, notifications);
    return { service, printStoredFile, queue, notifications, prisma };
}

describe('scheduled prints', () => {
    it('starts the file with its saved options when the printer is idle', async () => {
        const h = harness({ connected: true, printState: 'standby' });
        await h.service.fire('s1');
        expect(h.printStoredFile).toHaveBeenCalledTimes(1);
        const [fileId, opts] = (h.printStoredFile.mock.calls[0] ?? []) as unknown as [string, Record<string, unknown>];
        expect(fileId).toBe('f1');
        expect(opts.excludedObjects).toEqual(['cube']);
        expect(opts.timelapse).toBe(true);
        expect(String(opts.serveBase)).toMatch(/^http:\/\/.+:7125$/);
        expect(h.notifications.emitCustom).toHaveBeenCalledWith('p1', 'Kobra', 'scheduled_print', {
            filename: 'bracket.gcode',
            result: 'started',
            error: '',
        });
        expect(h.prisma.client.scheduledPrint.delete).toHaveBeenCalled();
    });

    it('queues the file first when the printer is busy', async () => {
        const h = harness({ connected: true, printState: 'printing' });
        await h.service.fire('s1');
        expect(h.printStoredFile).not.toHaveBeenCalled();
        expect(h.queue.add).toHaveBeenCalledWith(
            'f1',
            ['cube'],
            true,
            { timelapse: true },
            { printerId: 'p1', targetTags: [] },
            false,
        );
        expect(h.notifications.emitCustom).toHaveBeenCalledWith('p1', 'Kobra', 'scheduled_print', {
            filename: 'bracket.gcode',
            result: 'queued',
            error: '',
        });
    });

    it('reports a failed start', async () => {
        const h = harness({ connected: true, printState: 'standby' });
        h.printStoredFile.mockImplementation(async () => {
            throw new Error('upload failed');
        });
        await h.service.fire('s1');
        expect(h.notifications.emitCustom).toHaveBeenCalledWith('p1', 'Kobra', 'scheduled_print', {
            filename: 'bracket.gcode',
            result: 'failed',
            error: 'upload failed',
        });
    });

    it('tolerates broken option payloads', () => {
        expect(parseOptions('not json')).toEqual({});
        expect(parseOptions('null')).toEqual({});
    });
});
