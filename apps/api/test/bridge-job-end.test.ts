import { describe, expect, it, mock } from 'bun:test';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

type Failure = {
    errorCode?: number;
    errorMsg?: string;
    snapshot?: Buffer | null;
    pausedAt?: Date | null;
    failureReason?: string;
};
type FinishArgs = [string, string, number, unknown[], number | null, Failure];

function harness(open: { id: string; filename: string; pausedAt: Date | null } | null = null) {
    const finishJob = mock(async (..._args: FinishArgs) => undefined);
    const setJobPaused = mock(async (_id: string, _at: Date | null) => undefined);
    const gcode = {
        getByFilename: async () => null,
        findOpenJob: async () => open,
        setJobPaused,
        startJob: async () => 'job-1',
        closeOpenJobs: async () => 0,
        finishJob,
    } as unknown as GcodeService;
    const config = {
        id: 'printer-1',
        name: 'Kobra 4',
        ip: '127.0.0.1',
        mqttPort: 9883,
        username: 'u',
        password: 'p',
        deviceId: 'd',
        modeId: '20028',
        httpPort: 7125,
        settings: {},
    } as unknown as BridgePrinterConfig;
    const bridge = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    const internals = bridge as unknown as {
        s: { connected: boolean };
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
    };
    internals.s.connected = true;
    const jobs: unknown[][] = [];
    bridge.on('job', (...args: unknown[]) => jobs.push(args));
    const report = async (payload: Record<string, unknown>) => {
        internals.onReport('print/report', payload);
        await new Promise((r) => setTimeout(r, 0));
    };
    const start = () => report({ state: 'printing', data: { filename: 'part.gcode', print_time: 10 } });
    const last = () => finishJob.mock.calls[finishJob.mock.calls.length - 1] as unknown as FinishArgs;
    return { bridge, report, start, finishJob, setJobPaused, jobs, last };
}

const frame = Buffer.from('jpeg');

describe('job end', () => {
    it('closes a finished print as completed without any failure data', async () => {
        const h = harness();
        await h.start();
        h.bridge.camera.latestJpeg = frame;
        h.bridge.camera.latestJpegAt = Date.now();
        await h.report({ state: 'finished', data: { filename: 'part.gcode' } });
        const [jobId, status, , , durationSec, failure] = h.last();
        expect([jobId, status, durationSec]).toEqual(['job-1', 'completed', 600]);
        expect(failure).toEqual({ errorCode: 0, errorMsg: '', snapshot: null, pausedAt: null, failureReason: '' });
        expect(h.jobs).toEqual([
            ['start', 'job-1', 'part.gcode', null],
            ['end', 'job-1', 'part.gcode', 'completed'],
        ]);
        expect(h.bridge.snapshot().errorCode).toBe(0);
    });

    it('keeps the pause error and a fresh camera frame when the print is cancelled', async () => {
        const h = harness();
        await h.start();
        await h.report({ state: 'pause', code: 20001, msg: 'Filament runout', data: { filename: 'part.gcode' } });
        expect(h.bridge.snapshot()).toMatchObject({ errorCode: 20001, pauseMsg: 'Filament runout' });
        h.bridge.camera.latestJpeg = frame;
        h.bridge.camera.latestJpegAt = Date.now() - 30_000;
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        const [, status, , , , failure] = h.last();
        expect(status).toBe('cancelled');
        expect(failure).toEqual({
            errorCode: 20001,
            errorMsg: 'Filament runout',
            snapshot: frame,
            pausedAt: expect.any(Date),
            failureReason: '',
        });
        expect(h.jobs[1]).toEqual(['end', 'job-1', 'part.gcode', 'cancelled']);
        expect(h.bridge.snapshot()).toMatchObject({ errorCode: 0, pauseMsg: '' });
    });

    it('ignores a camera frame older than two minutes', async () => {
        const h = harness();
        await h.start();
        h.bridge.camera.latestJpeg = frame;
        h.bridge.camera.latestJpegAt = Date.now() - 130_000;
        await h.report({ state: 'canceled', data: { filename: 'part.gcode' } });
        const [, status, , , , failure] = h.last();
        expect(status).toBe('cancelled');
        expect(failure.snapshot).toBeNull();
    });

    it('forgets the pause error once the print resumes', async () => {
        const h = harness();
        await h.start();
        await h.report({ state: 'pause', code: 7, msg: 'Door open', data: { filename: 'part.gcode' } });
        await h.report({ state: 'resuming', data: { filename: 'part.gcode' } });
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        const [, , , , , failure] = h.last();
        expect(failure).toEqual({ errorCode: 0, errorMsg: '', snapshot: null, pausedAt: null, failureReason: '' });
    });

    it('labels a print cancelled from Kobralink with the reason given', async () => {
        const h = harness();
        const stopPrint = mock(async () => ({ state: 'done', code: 200 }));
        (h.bridge as unknown as { client: { stopPrint: typeof stopPrint } }).client = {
            connected: true,
            stopPrint,
        } as never;
        await h.start();
        await h.bridge.cancel('spaghetti');
        expect(stopPrint).toHaveBeenCalledOnce();
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        expect(h.last()[5].failureReason).toBe('spaghetti');
        await h.start();
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        expect(h.last()[5].failureReason).toBe('');
    });

    it('forgets the reason when the cancel command fails', async () => {
        const h = harness();
        (h.bridge as unknown as { client: { stopPrint: () => Promise<void> } }).client = {
            connected: true,
            stopPrint: async () => {
                throw new Error('timeout');
            },
        } as never;
        await h.start();
        await expect(h.bridge.cancel('clog')).rejects.toThrow('timeout');
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        expect(h.last()[5].failureReason).toBe('');
    });

    it('does nothing when no job is open', async () => {
        const h = harness();
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        expect(h.finishJob).not.toHaveBeenCalled();
        expect(h.jobs).toEqual([]);
    });
});

describe('job pause', () => {
    it('records the pause once and clears it when the print resumes', async () => {
        const h = harness();
        await h.start();
        await h.report({ state: 'pausing', data: { filename: 'part.gcode' } });
        await h.report({ state: 'paused', data: { filename: 'part.gcode' } });
        expect(h.setJobPaused).toHaveBeenCalledTimes(1);
        expect(h.setJobPaused.mock.calls[0]).toEqual(['job-1', expect.any(Date)]);
        await h.report({ state: 'resuming', data: { filename: 'part.gcode' } });
        await h.report({ state: 'printing', data: { filename: 'part.gcode' } });
        expect(h.setJobPaused).toHaveBeenCalledTimes(2);
        expect(h.setJobPaused.mock.calls[1]).toEqual(['job-1', null]);
    });

    it('ends a print cancelled during a pause as paused, through the stopping state', async () => {
        const h = harness();
        await h.start();
        await h.report({ state: 'paused', data: { filename: 'part.gcode' } });
        await h.report({ state: 'stopping', data: { filename: 'part.gcode' } });
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        const [, status, , , , failure] = h.last();
        expect(status).toBe('cancelled');
        expect(failure.pausedAt).toBeInstanceOf(Date);
    });

    it('starts the next print without the previous pause', async () => {
        const h = harness();
        await h.start();
        await h.report({ state: 'paused', data: { filename: 'part.gcode' } });
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        await h.start();
        await h.report({ state: 'finished', data: { filename: 'part.gcode' } });
        expect(h.last()[5].pausedAt).toBeNull();
    });

    it('ignores pauses while no job is open', async () => {
        const h = harness();
        await h.report({ state: 'paused', data: { filename: 'part.gcode' } });
        expect(h.setJobPaused).not.toHaveBeenCalled();
    });

    it('clears the stored pause of a job that resumed while Kobralink was offline', async () => {
        const h = harness({ id: 'job-9', filename: 'part.gcode', pausedAt: new Date('2026-10-30T08:00:00Z') });
        await h.start();
        await new Promise((r) => setTimeout(r, 0));
        expect(h.setJobPaused.mock.calls).toEqual([['job-9', null]]);
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        const [jobId, , , , , failure] = h.last();
        expect(jobId).toBe('job-9');
        expect(failure.pausedAt).toBeNull();
    });
});

describe('calibration', () => {
    it('counts no print time for a print cancelled while calibrating', async () => {
        const h = harness();
        await h.report({ state: 'printing', data: { filename: 'part.gcode' } });
        await h.report({ state: 'auto_leveling', data: { filename: 'part.gcode', progress: 100 } });
        await h.report({ state: 'vibrating', data: { filename: 'part.gcode', progress: 10 } });
        expect(h.bridge.snapshot()).toMatchObject({ printState: 'printing', kobraState: 'vibrating', progress: 0 });
        await h.report({ state: 'stoped', data: { filename: 'part.gcode' } });
        const [, status, , , durationSec] = h.last();
        expect(status).toBe('cancelled');
        expect(durationSec).toBe(0);
    });

    it('counts the printer time once the first layer is printed', async () => {
        const h = harness();
        await h.report({ state: 'printing', data: { filename: 'part.gcode' } });
        await h.report({ state: 'preheating', data: { filename: 'part.gcode' } });
        await h.report({ state: 'printing', data: { filename: 'part.gcode', curr_layer: 1, print_time: 5 } });
        await h.report({ state: 'finished', data: { filename: 'part.gcode' } });
        expect(h.last()[4]).toBe(300);
    });

    it('falls back to the wall clock when the printer printed without reporting its time', async () => {
        const h = harness();
        await h.report({ state: 'printing', data: { filename: 'part.gcode' } });
        await h.report({ state: 'printing', data: { filename: 'part.gcode', curr_layer: 3 } });
        await h.report({ state: 'finished', data: { filename: 'part.gcode' } });
        expect(h.last()[4]).toBeNull();
    });
});
