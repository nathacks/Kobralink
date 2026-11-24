import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';
import { type BridgePrinterConfig, type FilamentUsageSink, PrinterBridge } from '../src/bridge/printer-bridge';
import { badGateway } from '../src/common/bad-gateway';
import { GcodeService, type StoredFile } from '../src/gcode/gcode.service';

type Reply = { state?: string; code?: number; msg?: string } | null;
type OpenJob = { id: string; filename: string; pausedAt: Date | null; usageState: string };

const PART = { filename: 'part.gcode', print_time: 10, curr_layer: 5 };
const FILE = {
    id: 'file-1',
    filename: 'next.gcode',
    md5: 'm',
    sizeBytes: 5,
    estPrintTimeSec: 600,
    layerHeight: 0.1,
    firstLayerHeight: 0.1,
    thumbnail: 'next-thumb',
    filaments: [],
    objects: ['A'],
} as unknown as StoredFile;

function harness(opts: { open?: OpenJob; closed?: number; sinks?: FilamentUsageSink[] } = {}) {
    const started: string[] = [];
    const finished: { id: string; status: string; mm: number; sec: number | null; failure: Record<string, unknown> }[] =
        [];
    const usageStates: string[] = [];
    const gcode = {
        getByFilename: async () => null,
        findOpenJob: async () => opts.open ?? null,
        setJobPaused: async () => undefined,
        startJob: async (_p: string, filename: string) => {
            started.push(filename);
            return `job-${started.length}`;
        },
        closeOpenJobs: async () => opts.closed ?? 0,
        saveUsageState: async (_id: string, state: string) => {
            usageStates.push(state);
        },
        finishJob: async (
            id: string,
            status: string,
            mm: number,
            _u: unknown,
            sec: number | null,
            failure: Record<string, unknown>,
        ) => {
            finished.push({ id, status, mm, sec, failure });
        },
        readData: async () => ({ file: FILE, data: Buffer.alloc(5) }),
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
    const bridge = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) }, opts.sinks ?? []);
    const internals = bridge as unknown as {
        s: Record<string, unknown>;
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
        ensureConnected: () => void;
        markOffline: (e: { code: string }) => void;
        lastUpload: unknown;
        log: Record<string, (m: string) => void>;
    };
    for (const level of ['log', 'warn', 'debug']) internals.log[level] = () => undefined;
    internals.ensureConnected = () => undefined;
    internals.s.connected = true;
    const flush = () => new Promise((r) => setTimeout(r, 2));
    const send = async (suffix: string, payload: Record<string, unknown>) => {
        internals.onReport(suffix, payload);
        await flush();
    };
    const print = (state: string, data: Record<string, unknown> | null = PART, extra = {}) =>
        send('print/report', { state, data, ...extra });
    const info = (data: Record<string, unknown>) => send('info/report', { data });
    const events: string[] = [];
    bridge.on('event', (e) => events.push(e.type));
    return { bridge, internals, send, print, info, started, finished, usageStates, events, flush };
}

function later(ms: number) {
    setSystemTime(new Date(Date.now() + ms));
}

afterEach(() => {
    setSystemTime();
});

describe('failed print reports', () => {
    it('that refuse a command leave the running print alone', async () => {
        const h = harness();
        await h.print('printing');
        await h.print('failed', null, { action: 'pause', code: 10102 });
        expect(h.bridge.snapshot()).toMatchObject({ printState: 'printing', kobraState: 'printing' });
        await h.info({ state: 'busy', project: { ...PART, state: 'printing' } });
        expect(h.finished).toEqual([]);
    });

    it('end the job with their reason once info confirms the failure', async () => {
        const h = harness();
        await h.print('printing');
        await h.print('failed', { filename: 'part.gcode' }, { code: 10121, msg: 'bed heating' });
        expect(h.finished).toEqual([]);
        await h.info({ state: 'failed' });
        expect(h.finished[0]).toMatchObject({
            id: 'job-1',
            status: 'error',
            failure: { errorCode: 10121, errorMsg: 'bed heating' },
        });
        expect(h.bridge.snapshot()).toMatchObject({ filename: '', errorCode: 0, currLayer: 0 });
    });
});

describe('a print that ends without a final report', () => {
    it('is closed once the printer stayed idle, not on a short idle report', async () => {
        const h = harness();
        await h.print('printing');
        await h.info({ state: 'free' });
        later(5_000);
        await h.info({ state: 'free' });
        await h.print('printing');
        later(8_000);
        await h.info({ state: 'free' });
        expect(h.finished).toEqual([]);
        later(11_000);
        await h.info({ state: 'free' });
        expect(h.finished.map((f) => f.status)).toEqual(['error']);
        expect(h.events).toContain('print_cancelled');
    });

    it('does not lend its job to the next file', async () => {
        const h = harness();
        await h.print('printing');
        await h.info({ state: 'free' });
        await h.print('printing', { ...PART, filename: 'second.gcode' });
        expect(h.started).toEqual(['part.gcode', 'second.gcode']);
        expect(h.finished.map((f) => f.id)).toEqual(['job-1']);
        expect(h.bridge.snapshot().filename).toBe('second.gcode');
    });

    it('during a disconnection leaves nothing to the next job', async () => {
        const h = harness();
        await h.print('printing', { ...PART, print_time: 37, supplies_usage: 5214 });
        h.internals.markOffline({ code: 'lost' });
        h.internals.s.connected = true;
        await h.info({ state: 'free' });
        expect(h.bridge.snapshot()).toMatchObject({ filename: '', progress: 0, printDurationSec: 0 });
        await h.print('printing', { ...PART, filename: 'second.gcode', print_time: 2, supplies_usage: 278 });
        await h.print('stoped', { filename: 'second.gcode' });
        expect(h.finished[1]).toMatchObject({ mm: 278, sec: 120 });
    });

    it('while Kobralink was stopped is announced, unless it completed', async () => {
        for (const [state, expected] of [
            ['free', 1],
            ['finished', 0],
        ] as const) {
            const h = harness({ closed: 1 });
            let interrupted = 0;
            h.bridge.on('interrupted', () => {
                interrupted++;
            });
            await h.info({ state });
            expect(interrupted).toBe(expected);
        }
    });
});

describe('a restart of Kobralink', () => {
    it('during a pause adopts the job and keeps its pause', async () => {
        const pausedAt = new Date('2026-10-30T08:00:00Z');
        const h = harness({ open: { id: 'job-9', filename: 'part.gcode', pausedAt, usageState: '' } });
        await h.print('paused');
        await h.print('stoped', { filename: 'part.gcode' });
        expect(h.finished[0]).toMatchObject({ id: 'job-9', status: 'cancelled', failure: { pausedAt } });
        expect(h.events).toContain('print_cancelled');
    });

    it('during a print does not count the filament twice', async () => {
        const run = (used: number[], open?: OpenJob) => {
            const sink: FilamentUsageSink = {
                name: 'local',
                syncRateSec: 1,
                slotMap: () => new Map([[0, 's']]),
                useFilament: async (_id, mm) => {
                    used.push(Math.round(mm));
                },
            };
            return harness({ sinks: [sink], open });
        };
        const box = { data: { multi_color_box: [{ id: -1, loaded_slot: 0, slots: [{ index: 0, status: 5 }] }] } };
        const used: number[] = [];
        const before = run(used);
        await before.print('printing', { ...PART, supplies_usage: 5000 });
        await before.send('multiColorBox/report', box);
        const usageState = before.usageStates.at(-1) ?? '';
        const after = run(used, { id: 'job-1', filename: 'part.gcode', pausedAt: null, usageState });
        await after.print('printing', { ...PART, supplies_usage: 5100 });
        await after.send('multiColorBox/report', box);
        await after.print('stoped', { filename: 'part.gcode' });
        expect(used.reduce((a, b) => a + b, 0)).toBe(5100);
    });
});

describe('skipped objects', () => {
    it('do not carry over to the next print', async () => {
        const h = harness();
        await h.print('printing');
        await h.send('skip/report', { data: { objects_skip_parts: ['A'] } });
        expect(h.bridge.snapshot().skippedObjects).toEqual(['A']);
        await h.print('finished');
        expect(h.bridge.snapshot().skippedObjects).toEqual([]);
    });
});

describe('printer messages', () => {
    it('that cannot be read do not throw out of the MQTT client', () => {
        const h = harness();
        const bad = [
            ['multiColorBox/report', { data: { multi_color_box: [null] } }],
            ['multiColorBox/report', { data: { multi_color_box: [{ id: 0, slots: {} }] } }],
            ['skip/report', { data: { objects_skip_parts: 'A' } }],
        ] as const;
        for (const [suffix, payload] of bad) {
            expect(() => h.bridge.client.emit('report', suffix, payload as never)).not.toThrow();
        }
    });

    it('that refuse a temperature keep the last values', async () => {
        const h = harness();
        await h.send('tempature/report', { state: 'done', data: { curr_nozzle_temp: 178, curr_hotbed_temp: 55 } });
        await h.send('tempature/report', { state: 'failed', code: 10301, data: null });
        await h.send('tempature/report', { state: 'done', data: { curr_nozzle_temp: 'abc' } });
        expect(h.bridge.snapshot()).toMatchObject({ nozzleTemp: 178, bedTemp: 55 });
    });
});

describe('print commands', () => {
    it('fail when the printer refuses or does not answer', async () => {
        const h = harness();
        const replies: Reply[] = [null, { state: 'failed', code: 10102 }];
        for (const reply of replies) {
            const answer = async () => reply as never;
            Object.assign(h.bridge.client, { pausePrint: answer, resumePrint: answer, stopPrint: answer });
            await expect(h.bridge.pause()).rejects.toThrow();
            await expect(h.bridge.resume()).rejects.toThrow();
            await expect(h.bridge.cancel('spaghetti')).rejects.toThrow();
        }
        await h.print('printing');
        await h.print('stoped');
        expect(h.finished[0].failure.failureReason).toBe('');
    });

    it('that fail to start leave the running print untouched', async () => {
        const h = harness();
        await h.print('printing');
        await h.send('skip/report', { data: { objects_skip_parts: ['A'] } });
        Object.assign(h.internals.s, { thumbnail: 'thumb', slicerTimeSec: 42 });
        h.internals.lastUpload = { filename: FILE.filename, md5: FILE.md5, size: FILE.sizeBytes, url: '' };
        Object.assign(h.bridge.client, { startPrint: async () => ({ state: 'failed', code: 10112 }) });
        await expect(h.bridge.printStoredFile('file-1', { serveBase: 'http://x' })).rejects.toThrow();
        expect(h.bridge.snapshot()).toMatchObject({
            thumbnail: 'thumb',
            slicerTimeSec: 42,
            skippedObjects: ['A'],
            filename: 'part.gcode',
        });
        expect(h.finished).toEqual([]);
    });

    it('that start a file close the job left open and point to that exact file', async () => {
        const h = harness();
        await h.print('printing');
        h.internals.lastUpload = { filename: FILE.filename, md5: FILE.md5, size: FILE.sizeBytes, url: '' };
        let url = '';
        Object.assign(h.bridge.client, {
            startPrint: async (p: { url: string }) => {
                url = p.url;
                return { state: 'printing', code: 0 };
            },
        });
        await h.bridge.printStoredFile('file-1', { serveBase: 'http://x' });
        expect(url).toBe('http://x/serve/file-1/next.gcode');
        expect(h.started).toEqual(['part.gcode', 'next.gcode']);
        expect(h.finished.map((f) => [f.id, f.status])).toEqual([['job-1', 'error']]);
        expect(h.bridge.snapshot()).toMatchObject({ filename: 'next.gcode', slicerTimeSec: 600 });
    });
});

describe('printer file requests', () => {
    it('sent together each get their own answer', async () => {
        const h = harness();
        Object.assign(h.bridge.client, {
            requestFileDetails: (filename: string) =>
                setTimeout(() => {
                    for (const name of ['other.gcode', filename]) {
                        h.internals.onReport('file/report', {
                            action: 'fileDetails',
                            code: 200,
                            data: { filename: name, file_details: { thumbnail: `thumb-${name}` } },
                        });
                    }
                }, 2),
        });
        const names = ['a.gcode', 'b.gcode', 'c.gcode'];
        expect(await Promise.all(names.map((n) => h.bridge.printerFileThumbnail(n)))).toEqual(
            names.map((n) => `thumb-${n}`),
        );
    });
});

describe('connection', () => {
    it('uses a new MQTT client when the address changes', async () => {
        const h = harness();
        const before = h.bridge.client;
        await h.bridge.updateConfig({ ...h.bridge.config, name: 'Renamed' });
        expect(h.bridge.client).toBe(before);
        await h.bridge.updateConfig({ ...h.bridge.config, ip: '127.0.0.2' });
        expect(h.bridge.client).not.toBe(before);
        expect((h.bridge.client as unknown as { opts: { host: string } }).opts.host).toBe('127.0.0.2');
    });

    it('is no longer manually offline after a reconnection', async () => {
        const h = harness();
        await h.bridge.disconnectManual();
        expect(h.bridge.snapshot().manualOffline).toBe(true);
        await h.bridge.reconnectNow();
        expect(h.bridge.snapshot().manualOffline).toBe(false);
    });

    it('names the refused command so the dashboard shows it once', async () => {
        const h = harness();
        const refused: string[] = [];
        h.bridge.on('refused', (r) => refused.push(`${r.printerId}:${r.topic}:${r.action}`));
        const reply = { type: 'print', action: 'pause', state: 'failed', code: 10102, msg: '', data: null };
        await h.send('print/report', reply);
        Object.assign(h.bridge.client, { pausePrint: async () => reply });
        const error = await h.bridge.pause().catch((e) => e);
        expect(refused).toEqual([error.refused]);
        expect(badGateway(error).getResponse()).toMatchObject({ statusCode: 502, refused: 'printer-1:print:pause' });
    });

    it('wakes the poll loop even after a skip query', async () => {
        const h = harness();
        const loop = h.bridge as unknown as { sleep: (ms: number) => Promise<void>; wakeLoop: () => void };
        Object.assign(h.bridge.client, { querySkipObjects: async () => null });
        const slept = loop.sleep(60_000);
        const query = h.bridge.querySkip();
        await h.flush();
        h.internals.s.skipTs = Date.now() + 1;
        await query;
        loop.wakeLoop();
        await slept;
    });
});

describe('ACE drying', () => {
    it('keeps the humidity of each unit', async () => {
        const h = harness();
        const unit = (id: number, humidity: number) => ({ id, slots: [], drying_status: { status: 0, humidity } });
        await h.send('multiColorBox/report', { data: { multi_color_box: [unit(0, 28), unit(1, 35)] } });
        Object.assign(h.bridge.client, { setDry: () => undefined });
        h.bridge.aceDry('start', { aceId: 1, targetTemp: 45, duration: 60 });
        expect(h.bridge.snapshot().aceUnits.map((u) => [u.drying.status, u.drying.humidity])).toEqual([
            [0, 28],
            [1, 35],
        ]);
    });
});

describe('stored file names', () => {
    it('are shortened without losing the extension', () => {
        const name = GcodeService.safeName(`${'é'.repeat(300)}.gcode`);
        expect(Buffer.byteLength(name)).toBeLessThanOrEqual(200);
        expect(name.endsWith('é.gcode')).toBe(true);
        expect(GcodeService.safeName('été.gcode')).toBe('été.gcode');
    });
});
