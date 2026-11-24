import { describe, expect, it, mock } from 'bun:test';
import { type BridgeDomainEvent, type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

function harness() {
    const gcode = {
        getByFilename: async () => null,
        findOpenJob: async () => null,
        setJobPaused: async () => undefined,
        startJob: async () => 'job-1',
        closeOpenJobs: async () => 0,
        finishJob: mock(async () => undefined),
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
        log: { log: (m: string) => void; warn: (m: string) => void };
    };
    internals.s.connected = true;
    internals.log.log = () => undefined;
    const warnings: string[] = [];
    internals.log.warn = (m) => warnings.push(m);
    const jobs: unknown[][] = [];
    bridge.on('job', (...args: unknown[]) => jobs.push(args));
    const pauses: unknown[] = [];
    bridge.on('event', (ev: BridgeDomainEvent) => {
        if (ev.type === 'print_paused') pauses.push(ev.data?.code);
    });
    const report = async (
        state: string,
        data: Record<string, unknown>,
        reason: { code?: number; msg?: string } = {},
    ) => {
        internals.onReport('print/report', { action: 'update', state, data, ...reason });
        await new Promise((r) => setTimeout(r, 0));
    };
    return { bridge, report, jobs, pauses, warnings };
}

const settings = (fan: number, nozzle = 230, bed = 70) => ({
    fan_speed_pct: fan,
    print_speed_mode: 2,
    target_hotbed_temp: bed,
    target_nozzle_temp: nozzle,
    z_comp: 0,
});

const updated = (fan: number, nozzle = 230, bed = 70) => ({
    filename: 'part.gcode',
    curr_layer: 80,
    progress: 48,
    print_time: 17,
    remain_time: 20,
    total_layers: 172,
    supplies_usage: 1500,
    taskid: '-1',
    settings: settings(fan, nozzle, bed),
});

const jam = { code: 11842, msg: 'filament jam' };
const done = { code: 200, msg: 'done' };

describe('updated print reports', () => {
    it('leave a cancelled print cancelled, with its fields cleared', async () => {
        const h = harness();
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        await h.report('canceled', { filename: 'part.gcode' });
        await h.report('updated', updated(0, 0, 0));
        const s = h.bridge.snapshot();
        expect(s.printState).toBe('standby');
        expect(s.kobraState).toBe('canceled');
        expect(s.filename).toBe('');
        expect(s.progress).toBe(0);
        expect(h.jobs.map((j) => j[0])).toEqual(['start', 'end']);
    });

    it('are ignored when no print is running', async () => {
        const h = harness();
        await h.report('free', {});
        await h.report('updated', updated(90));
        const s = h.bridge.snapshot();
        expect(s.printState).toBe('standby');
        expect(s.kobraState).toBe('free');
        expect(s.filename).toBe('');
        expect(s.fanSpeed).toBe(0);
        expect(h.jobs).toEqual([]);
    });

    it('refresh the print fields and the part fan without changing the state', async () => {
        const h = harness();
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        await h.report('updated', updated(90));
        const s = h.bridge.snapshot();
        expect(s.printState).toBe('printing');
        expect(s.kobraState).toBe('printing');
        expect(s.currLayer).toBe(80);
        expect(s.progress).toBeCloseTo(0.48);
        expect(s.fanSpeed).toBe(90);
        expect(h.jobs.map((j) => j[0])).toEqual(['start']);
    });

    it('keep a print in its preparing step', async () => {
        const h = harness();
        await h.report('auto_leveling', { filename: 'part.gcode' });
        await h.report('updated', { ...updated(0, 140), curr_layer: 0, progress: 0 });
        const s = h.bridge.snapshot();
        expect(s.printState).toBe('printing');
        expect(s.kobraState).toBe('auto_leveling');
    });

    it('keep a paused print paused', async () => {
        const h = harness();
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        await h.report('paused', { filename: 'part.gcode' });
        await h.report('updated', updated(0));
        const s = h.bridge.snapshot();
        expect(s.printState).toBe('paused');
        expect(s.kobraState).toBe('paused');
    });

    it('ignore a part fan value that is not a number', async () => {
        const h = harness();
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        await h.report('updated', updated(40));
        await h.report('updated', { ...updated(0), settings: { ...settings(0), fan_speed_pct: 'fast' } });
        expect(h.bridge.snapshot().fanSpeed).toBe(40);
    });

    it('keep the pause reason when they acknowledge a change during the pause', async () => {
        const h = harness();
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        await h.report('paused', { filename: 'part.gcode' }, jam);
        await h.report('updated', updated(0, 205), done);
        await h.report('paused', { filename: 'part.gcode' }, jam);
        const s = h.bridge.snapshot();
        expect(s.errorCode).toBe(11842);
        expect(s.pauseMsg).toBe('filament jam');
        expect(h.pauses).toEqual([11842]);
    });
});

describe('pause reasons', () => {
    it('are logged and notified once while paused', async () => {
        const h = harness();
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        for (let i = 0; i < 3; i++) await h.report('paused', { filename: 'part.gcode' }, jam);
        expect(h.pauses).toEqual([11842]);
        expect(h.warnings).toEqual(['Printer paused: [11842] filament jam']);
    });

    it('are notified again when they change, and cleared on resume', async () => {
        const h = harness();
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        await h.report('paused', { filename: 'part.gcode' }, jam);
        await h.report('paused', { filename: 'part.gcode' }, { ...jam, code: 11518 });
        await h.report('paused', { filename: 'part.gcode' }, { code: 10402, msg: 'out of filament' });
        expect(h.pauses).toEqual([11842, 11518, 10402]);
        await h.report('printing', { filename: 'part.gcode', print_time: 10, curr_layer: 79 });
        const s = h.bridge.snapshot();
        expect(s.errorCode).toBe(0);
        expect(s.pauseMsg).toBe('');
    });
});
