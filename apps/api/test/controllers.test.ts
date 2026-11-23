import { describe, expect, it, mock } from 'bun:test';
import {
    cancelPrintSchema,
    deletePrinterFilesSchema,
    printPrinterFileSchema,
    schedulePrintSchema,
    startPrintSchema,
    updatePrintJobSchema,
} from '@kobralink/shared';
import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationController } from '../src/automations/automation.controller';
import type { AutomationService } from '../src/automations/automation.service';
import type { BridgeRegistry } from '../src/bridge/bridge.registry';
import { ZodPipe } from '../src/common/zod.pipe';
import { CoreController } from '../src/core/core.controller';
import type { GcodeService } from '../src/gcode/gcode.service';
import { MaintenanceController } from '../src/maintenance/maintenance.controller';
import type { MaintenanceService } from '../src/maintenance/maintenance.service';
import { QueueController } from '../src/queue/queue.controller';
import type { QueueService } from '../src/queue/queue.service';
import { ScheduledPrintController } from '../src/schedule/scheduled-print.controller';
import type { ScheduledPrintService } from '../src/schedule/scheduled-print.service';
import { LibraryController } from '../src/stats/library.controller';
import { StatsController } from '../src/stats/stats.controller';
import type { StatsService } from '../src/stats/stats.service';

describe('QueueController', () => {
    const queue = {
        status: mock(async () => ({
            awaitingBedClear: true,
            maintenance: false,
            nextFilename: 'a.gcode',
            autoStartAt: null,
        })),
        confirmBedClear: mock(async () => ({ started: { id: 'q1' }, startsAt: null })),
        cancelAutoStart: mock(() => true),
        startNext: mock(async () => ({ id: 'q1' })),
        add: mock(async () => ({ id: 'q2' })),
        check: mock(async () => ({ ok: true, printers: [] })),
        list: mock(async () => []),
        listFor: mock(async () => []),
        reorder: mock(async () => []),
        remove: mock(async () => undefined),
        clear: mock(async () => undefined),
        setMaintenance: mock(async () => ({ awaitingBedClear: false, maintenance: true, nextFilename: null })),
    };
    const ctrl = new QueueController(queue as unknown as QueueService);

    it('exposes the hold and confirms the bed is clear with a rating', async () => {
        expect(await ctrl.status('p1')).toEqual({
            awaitingBedClear: true,
            maintenance: false,
            nextFilename: 'a.gcode',
            autoStartAt: null,
        });
        expect(await ctrl.bedClear('p1', {})).toEqual({ started: { id: 'q1' }, startsAt: null });
        expect(queue.confirmBedClear).toHaveBeenCalledWith('p1', 'good');
        await ctrl.bedClear('p1', { outcome: 'bad' });
        expect(queue.confirmBedClear).toHaveBeenLastCalledWith('p1', 'bad');
    });

    it('cancels a pending automatic start and returns the status', async () => {
        expect(await ctrl.cancelAutoStart('p1')).toMatchObject({ awaitingBedClear: true, autoStartAt: null });
        expect(queue.cancelAutoStart).toHaveBeenCalledWith('p1');
    });

    it('turns a failed start into a 502', async () => {
        queue.confirmBedClear.mockImplementationOnce(async () => {
            throw new Error('printer busy');
        });
        await expect(ctrl.bedClear('p1', {})).rejects.toBeInstanceOf(BadGatewayException);
        queue.startNext.mockImplementationOnce(async () => {
            throw new Error('offline');
        });
        await expect(ctrl.start('p1')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('adds to the single queue for any printer, a printer or tags', async () => {
        await ctrl.add({ fileId: 'f1' });
        expect(queue.add).toHaveBeenLastCalledWith('f1', [], false, {}, { printerId: null, targetTags: [] });
        await ctrl.add({ fileId: 'f1', targetTags: ['petg'], excludedObjects: ['cube'], timelapse: true });
        expect(queue.add).toHaveBeenLastCalledWith(
            'f1',
            ['cube'],
            false,
            { timelapse: true },
            { printerId: null, targetTags: ['petg'] },
        );
        await ctrl.add({ fileId: 'f1', printerId: 'p2', targetTags: ['petg'] });
        expect(queue.add).toHaveBeenLastCalledWith('f1', [], false, {}, { printerId: 'p2', targetTags: [] });
    });

    it('adds from a printer page for that printer, with the dialog options', async () => {
        await ctrl.addFor('p1', {
            fileId: 'f1',
            excludedObjects: ['cube'],
            autoLeveling: false,
            vibrationCompensation: false,
        });
        expect(queue.add).toHaveBeenLastCalledWith(
            'f1',
            ['cube'],
            false,
            { autoLeveling: false, vibrationCompensation: false },
            { printerId: 'p1', targetTags: [] },
        );
    });

    it('checks, lists, reorders, removes, clears and toggles maintenance', async () => {
        await ctrl.check({ fileId: 'f1', targetTags: ['a'] });
        expect(queue.check).toHaveBeenLastCalledWith('f1', { printerId: null, targetTags: ['a'] });
        await ctrl.list();
        await ctrl.listFor('p1');
        expect(queue.listFor).toHaveBeenCalledWith('p1');
        await ctrl.reorder({ ids: ['b', 'a'] });
        expect(queue.reorder).toHaveBeenCalledWith(['b', 'a']);
        await ctrl.removeItem('q1');
        await ctrl.remove('q2');
        expect(queue.remove).toHaveBeenCalledTimes(2);
        await ctrl.clearAll();
        expect(queue.clear).toHaveBeenLastCalledWith();
        await ctrl.clear('p1');
        expect(queue.clear).toHaveBeenLastCalledWith('p1');
        expect((await ctrl.maintenance('p1', { enabled: true })).maintenance).toBe(true);
        expect(queue.setMaintenance).toHaveBeenCalledWith('p1', true);
    });
});

describe('MaintenanceController', () => {
    const maintenance = {
        list: mock(async () => []),
        create: mock(async () => ({ id: 't1' })),
        update: mock(async () => ({ id: 't1' })),
        complete: mock(async () => ({ id: 't1' })),
        logs: mock(async () => []),
        remove: mock(async () => undefined),
    };
    const ctrl = new MaintenanceController(maintenance as unknown as MaintenanceService);

    it('delegates every route to the service', async () => {
        await ctrl.list('p1');
        await ctrl.create('p1', { name: 'Lube' });
        await ctrl.update('p1', 't1', { name: 'Lube', intervalHours: 50 });
        await ctrl.complete('p1', 't1', { note: 'done' });
        await ctrl.remove('p1', 't1');
        expect(maintenance.list).toHaveBeenCalledWith('p1');
        expect(maintenance.create).toHaveBeenCalledWith('p1', { name: 'Lube' });
        expect(maintenance.update).toHaveBeenCalledWith('p1', 't1', { name: 'Lube', intervalHours: 50 });
        expect(maintenance.complete).toHaveBeenCalledWith('p1', 't1', { note: 'done' });
        expect(maintenance.remove).toHaveBeenCalledWith('p1', 't1');
    });

    it('clamps the log limit', async () => {
        await ctrl.logs('p1', 't1');
        await ctrl.logs('p1', 't1', '500');
        await ctrl.logs('p1', 't1', 'abc');
        expect(maintenance.logs.mock.calls.map((c) => c[2])).toEqual([20, 200, 20]);
    });
});

describe('ScheduledPrintController', () => {
    const schedule = {
        list: mock(async () => []),
        create: mock(async () => ({ id: 's1' })),
        remove: mock(async () => undefined),
    };
    const ctrl = new ScheduledPrintController(schedule as unknown as ScheduledPrintService);

    it('delegates list, create and remove', async () => {
        const body = { fileId: 'f1', startAt: '2026-11-01T08:00:00.000Z' };
        await ctrl.list('p1');
        expect(await ctrl.create('p1', body)).toEqual({ id: 's1' });
        await ctrl.remove('p1', 's1');
        expect(schedule.list).toHaveBeenCalledWith('p1');
        expect(schedule.create).toHaveBeenCalledWith('p1', body);
        expect(schedule.remove).toHaveBeenCalledWith('p1', 's1');
    });
});

describe('StatsController', () => {
    const stats = { compute: mock(async () => ({})), exportCsv: mock(async () => 'csv') };
    const ctrl = new StatsController(stats as unknown as StatsService);

    it('parses the printer and period filters', async () => {
        await ctrl.get();
        await ctrl.get('', 'abc');
        await ctrl.get('p1', '7');
        await ctrl.get('p1', '-3');
        expect(stats.compute.mock.calls).toEqual([
            [undefined, 0],
            [undefined, 0],
            ['p1', 7],
            ['p1', 0],
        ]);
        expect(await ctrl.exportCsv('p1', '30')).toBe('csv');
        expect(stats.exportCsv).toHaveBeenCalledWith('p1', 30);
    });
});

describe('CoreController history routes', () => {
    const gcode = {
        updateJob: mock(async () => ({ id: 'j1' })),
        snapshotPath: mock(async () => '/data/failures/j1.jpg'),
    };
    const stats = { history: mock(async () => []) };
    const ctrl = new CoreController(
        {} as BridgeRegistry,
        gcode as unknown as GcodeService,
        stats as unknown as StatsService,
    );

    it('clamps the history pagination', async () => {
        await ctrl.history('p1');
        await ctrl.history('p1', '999', 'x');
        await ctrl.history('p1', '10', '20');
        expect(stats.history.mock.calls).toEqual([
            ['p1', 50, 0],
            ['p1', 200, 0],
            ['p1', 10, 20],
        ]);
    });

    it('labels a job and 404s when it belongs to another printer', async () => {
        expect(await ctrl.updateJob('p1', 'j1', { failureReason: 'clog' })).toEqual({ id: 'j1' });
        expect(gcode.updateJob).toHaveBeenCalledWith('p1', 'j1', { failureReason: 'clog' });
        gcode.updateJob.mockImplementationOnce(async () => null);
        await expect(ctrl.updateJob('p1', 'j2', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('serves the failure snapshot as a jpeg and 404s without one', async () => {
        const sendFile = mock(() => undefined);
        const res = { type: mock(() => ({ sendFile })) };
        await ctrl.jobSnapshot('p1', 'j1', res as never);
        expect(res.type).toHaveBeenCalledWith('image/jpeg');
        expect(sendFile).toHaveBeenCalledWith('/data/failures/j1.jpg');
        gcode.snapshotPath.mockImplementationOnce(async () => null);
        await expect(ctrl.jobSnapshot('p1', 'j2', res as never)).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('CoreController cancel', () => {
    it('passes the cancel reason to the printer, none by default', async () => {
        const cancel = mock(async (_reason: string) => undefined);
        const registry = { get: () => ({ cancel }) } as unknown as BridgeRegistry;
        const ctrl = new CoreController(registry, {} as GcodeService, {} as StatsService);
        const pipe = new ZodPipe(cancelPrintSchema);
        await ctrl.cancel('p1', pipe.transform({ reason: 'adhesion' }));
        await ctrl.cancel('p1', pipe.transform(undefined));
        expect(cancel.mock.calls).toEqual([['adhesion'], ['']]);
        expect(() => pipe.transform({ reason: 'bogus' })).toThrow(BadRequestException);
    });
});

describe('CoreController print', () => {
    it('passes every option of the print dialog to the printer, flow calibration included', async () => {
        const printStoredFile = mock(async (_id: string, _opts: Record<string, unknown>) => ({ filename: 'a.gcode' }));
        const registry = {
            get: () => ({ config: { ip: '127.0.0.1', httpPort: 7125 }, printStoredFile }),
        } as unknown as BridgeRegistry;
        const gcode = { get: async (id: string) => ({ id, filename: 'a.gcode' }) } as unknown as GcodeService;
        const ctrl = new CoreController(registry, gcode, {} as StatsService);
        const body = new ZodPipe(startPrintSchema).transform({
            fileId: 'f1',
            autoLeveling: true,
            vibrationCompensation: false,
            flowCalibration: false,
            timelapse: true,
            failureDetection: false,
        });
        await ctrl.print('p1', body);
        const [id, opts] = printStoredFile.mock.calls[0];
        expect(id).toBe('f1');
        expect(String(opts.serveBase)).toEndWith(':7125');
        expect(opts).toMatchObject({
            autoLeveling: true,
            vibrationCompensation: false,
            flowCalibration: false,
            timelapse: true,
            failureDetection: false,
            excludedObjects: [],
        });
    });

    it('leaves flow calibration to the printer setting when the dialog says nothing', async () => {
        const printStoredFile = mock(async (_id: string, _opts: Record<string, unknown>) => ({ filename: 'a.gcode' }));
        const registry = {
            get: () => ({ config: { ip: '127.0.0.1', httpPort: 7125 }, printStoredFile }),
        } as unknown as BridgeRegistry;
        const gcode = { get: async (id: string) => ({ id, filename: 'a.gcode' }) } as unknown as GcodeService;
        const ctrl = new CoreController(registry, gcode, {} as StatsService);
        await ctrl.print('p1', new ZodPipe(startPrintSchema).transform({ fileId: 'f1' }));
        expect(printStoredFile.mock.calls[0][1].flowCalibration).toBeUndefined();
    });
});

describe('CoreController printer files', () => {
    const ctrlWith = (bridge: Record<string, unknown>) =>
        new CoreController({ get: () => bridge } as unknown as BridgeRegistry, {} as GcodeService, {} as StatsService);

    it('returns the printer files with the test models', async () => {
        const list = { files: [], testModels: [], truncated: false };
        const ctrl = ctrlWith({ listPrinterFiles: async () => list });
        expect(await ctrl.printerFiles('p1')).toEqual(list);
    });

    it('prints a test model by its path', async () => {
        const printPrinterFile = mock(async (_path: string, _size: number, _leveling?: boolean) => undefined);
        const ctrl = ctrlWith({ printPrinterFile });
        const body = new ZodPipe(printPrinterFileSchema).transform({
            filename: 'test_model/Shark.gcode',
            sizeBytes: 10,
        });
        await ctrl.printPrinterFile('p1', body);
        expect(printPrinterFile.mock.calls[0]).toEqual(['test_model/Shark.gcode', 10, undefined]);
        expect(() => new ZodPipe(printPrinterFileSchema).transform({ filename: 'other/x.gcode' })).toThrow(
            BadRequestException,
        );
    });

    it('asks for a test model thumbnail and refuses any other folder', async () => {
        const printerFileThumbnail = mock(async (path: string) => `thumb:${path}`);
        const ctrl = ctrlWith({ printerFileThumbnail });
        expect(await ctrl.printerFileThumbnail('p1', 'test_model/Shark.gcode')).toEqual({
            thumbnail: 'thumb:test_model/Shark.gcode',
        });
        await expect(ctrl.printerFileThumbnail('p1', 'other/x.gcode')).rejects.toThrow(BadRequestException);
        await expect(ctrl.printerFileThumbnail('p1', '')).rejects.toThrow(BadRequestException);
        expect(printerFileThumbnail.mock.calls).toEqual([['test_model/Shark.gcode']]);
    });

    it('deletes root files only', () => {
        const pipe = new ZodPipe(deletePrinterFilesSchema);
        expect(pipe.transform({ filenames: ['part.gcode'] })).toEqual({ filenames: ['part.gcode'] });
        expect(() => pipe.transform({ filenames: ['test_model/Shark.gcode'] })).toThrow(BadRequestException);
    });
});

describe('request validation of the new bodies', () => {
    it('accepts a known failure reason and rejects an unknown one', () => {
        const pipe = new ZodPipe(updatePrintJobSchema);
        expect(pipe.transform({ failureReason: 'spaghetti', note: '  x  ' })).toEqual({
            failureReason: 'spaghetti',
            note: 'x',
        });
        expect(pipe.transform({ failureReason: '' })).toEqual({ failureReason: '' });
        expect(() => pipe.transform({ failureReason: 'bogus' })).toThrow(BadRequestException);
        expect(() => pipe.transform({ note: 'x'.repeat(501) })).toThrow(BadRequestException);
    });

    it('requires a parseable start time for a scheduled print', () => {
        const pipe = new ZodPipe(schedulePrintSchema);
        expect(pipe.transform({ fileId: 'f1', startAt: '2026-11-01T08:00:00.000Z' })).toMatchObject({
            fileId: 'f1',
        });
        expect(() => pipe.transform({ fileId: 'f1', startAt: 'tomorrow' })).toThrow(BadRequestException);
        expect(() => pipe.transform({ startAt: '2026-11-01T08:00:00.000Z' })).toThrow(BadRequestException);
    });
});

describe('LibraryController', () => {
    const gcode = { list: mock(async () => [{ id: 'f1' }]) };
    const stats = { history: mock(async () => []) };
    const ctrl = new LibraryController(gcode as unknown as GcodeService, stats as unknown as StatsService);

    it('lists every stored file', async () => {
        expect(await ctrl.files()).toEqual([{ id: 'f1' }]);
        expect(gcode.list).toHaveBeenCalledWith();
    });

    it('lists the history of every printer or of one, with bounded paging', async () => {
        await ctrl.history();
        expect(stats.history).toHaveBeenLastCalledWith(undefined, 50, 0);
        await ctrl.history('p1', '999', '20');
        expect(stats.history).toHaveBeenLastCalledWith('p1', 200, 20);
        await ctrl.history('', 'x', 'y');
        expect(stats.history).toHaveBeenLastCalledWith(undefined, 50, 0);
    });
});

describe('AutomationController', () => {
    const automations = {
        list: mock(async () => []),
        create: mock(async () => ({ id: 'a1' })),
        update: mock(async () => ({ id: 'a1' })),
        setEnabled: mock(async () => ({ id: 'a1', enabled: false })),
        runNow: mock(async () => ({ id: 'a1' })),
        remove: mock(async () => undefined),
    };
    const ctrl = new AutomationController(automations as unknown as AutomationService);
    const body = { name: 'Off', trigger: 'print_finished', actions: [{ type: 'light', on: false }] } as const;

    it('lists, creates, updates, switches, runs and removes rules', async () => {
        await ctrl.list();
        await ctrl.create(body);
        await ctrl.update('a1', body);
        await ctrl.setEnabled('a1', { enabled: false });
        await ctrl.run('a1', { printerId: 'p1' });
        await ctrl.remove('a1');
        expect(automations.list).toHaveBeenCalledOnce();
        expect(automations.create).toHaveBeenCalledWith(body);
        expect(automations.update).toHaveBeenCalledWith('a1', body);
        expect(automations.setEnabled).toHaveBeenCalledWith('a1', false);
        expect(automations.runNow).toHaveBeenCalledWith('a1', 'p1');
        expect(automations.remove).toHaveBeenCalledWith('a1');
    });
});
