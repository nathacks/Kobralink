import { afterEach, describe, expect, it, mock } from 'bun:test';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

const bridges: PrinterBridge[] = [];

function bridge(settings: Record<string, unknown> = {}) {
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
        settings,
    } as unknown as BridgePrinterConfig;
    const b = new PrinterBridge(config, {} as GcodeService, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    bridges.push(b);
    let triggers = 0;
    b.on('light_trigger', () => {
        triggers += 1;
    });
    const log = mock((_msg: string) => undefined);
    const internals = b as unknown as {
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
        markOffline: (error: { code: string }) => void;
        log: { log: typeof log };
    };
    internals.log.log = log;
    return {
        b,
        log,
        report: internals.onReport.bind(b),
        markOffline: internals.markOffline.bind(b),
        triggers: () => triggers,
    };
}

afterEach(async () => {
    for (const b of bridges.splice(0)) await b.stop();
});

describe('light reports', () => {
    it('read the camera light out of a query answer without counting it as a tap', () => {
        const h = bridge();
        for (let i = 0; i < 3; i++) {
            h.report('light/report', {
                action: 'query',
                data: {
                    lights: [
                        { type: 1, status: 0, brightness: 0 },
                        { type: 3, status: 1, brightness: 70 },
                    ],
                },
            });
        }
        expect(h.b.snapshot()).toMatchObject({ lightOn: true, lightBrightness: 70 });
        expect(h.triggers()).toBe(0);
    });

    it('count a switch of another lamp as a tap but leave the camera light as it is', () => {
        const h = bridge();
        h.report('light/report', { action: 'control', data: { type: 3, status: 1, brightness: 100 } });
        h.report('light/report', { action: 'control', data: { type: 1, status: 0, brightness: 0 } });
        h.report('light/report', { action: 'control', data: { type: 1, status: 1, brightness: 100 } });
        expect(h.triggers()).toBe(1);
        expect(h.b.snapshot()).toMatchObject({ lightOn: true, lightBrightness: 100 });
    });

    it('do not turn the light off when a report says nothing about it', () => {
        const h = bridge();
        h.report('light/report', { action: 'control', data: { status: 1, brightness: 100 } });
        h.report('light/report', { action: 'control', data: { type: 3 } });
        h.report('light/report', { action: 'query', data: { lights: [] } });
        expect(h.b.snapshot().lightOn).toBe(true);
    });
});

describe('fan reports', () => {
    it('update the part fan speed as soon as the printer pushes it', () => {
        const h = bridge();
        h.report('fan/report', { action: 'auto', data: { fan_speed_pct: 55, aux_fan_speed_pct: 0, taskid: '7' } });
        expect(h.b.snapshot().fanSpeed).toBe(55);
        h.report('fan/report', { action: 'auto', data: { fan_speed_pct: 0 } });
        expect(h.b.snapshot().fanSpeed).toBe(0);
    });

    it('keep the known speed when the report has none', () => {
        const h = bridge();
        h.report('fan/report', { action: 'auto', data: { fan_speed_pct: 40 } });
        h.report('fan/report', { action: 'auto', data: { aux_fan_speed_pct: 20 } });
        h.report('fan/report', { action: 'auto', data: { fan_speed_pct: null } });
        h.report('fan/report', { action: 'auto', data: { fan_speed_pct: 'fast' } });
        h.report('fan/report', { action: 'auto', data: null });
        expect(h.b.snapshot().fanSpeed).toBe(40);
    });
});

describe('info features', () => {
    const featuresLogged = (log: ReturnType<typeof mock>) =>
        log.mock.calls.filter(([msg]) => String(msg).startsWith('Features reported by the printer'));

    it('are logged once per connection, sorted, and again when they change', () => {
        const h = bridge();
        h.report('info/report', {
            data: { features: { flow_calibration_support: true, auto_leveling_support: true } },
        });
        h.report('info/report', {
            data: { features: { auto_leveling_support: true, flow_calibration_support: true } },
        });
        expect(featuresLogged(h.log)).toEqual([
            ['Features reported by the printer: {"auto_leveling_support":true,"flow_calibration_support":true}'],
        ]);
        h.report('info/report', { data: { features: { auto_leveling_support: false } } });
        expect(featuresLogged(h.log)).toHaveLength(2);
    });

    it('are logged again after a reconnection', () => {
        const h = bridge();
        const report = { data: { features: { auto_leveling_support: true } } };
        h.report('info/report', report);
        h.markOffline({ code: 'lost' });
        h.report('info/report', report);
        expect(featuresLogged(h.log)).toHaveLength(2);
    });

    it('are not logged when the printer reports none', () => {
        const h = bridge();
        h.report('info/report', { data: { state: 'free' } });
        expect(featuresLogged(h.log)).toHaveLength(0);
    });
});

describe('connecting', () => {
    it('asks the printer for its lights once the session is open', async () => {
        const h = bridge({
            pollIntervalSec: 60,
            alerts: { nozzleMaxC: 0, bedMaxC: 0, offlineMinutes: 0 },
            cameraAlwaysOn: false,
        });
        const queryLight = mock(() => undefined);
        const client = {
            connected: true,
            connect: mock(async () => undefined),
            disconnect: mock(async () => undefined),
            queryInfo: mock(async () => null),
            queryMultiColorBox: mock(async () => null),
            queryLight,
        };
        const internals = h.b as unknown as { client: typeof client; printerReachable: () => Promise<boolean> };
        internals.client = client;
        internals.printerReachable = async () => true;
        h.b.start();
        for (let i = 0; i < 50 && !client.queryInfo.mock.calls.length; i++) await new Promise((r) => setTimeout(r, 5));
        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(queryLight).toHaveBeenCalledTimes(1);
        expect(h.b.snapshot().connected).toBe(true);
    });
});
