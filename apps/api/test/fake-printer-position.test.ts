import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { type KobraMqttClient, uploadAccepted, uploadGcode } from '@kobralink/kobra-protocol';
import { type PrinterLiveState, printerSettingsSchema } from '@kobralink/shared';
import { FakePrinter, parseToolpath, toolpathPosition } from '../dev/fake-printer';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';
import { MoonrakerService } from '../src/moonraker/moonraker.service';

const SQUARE = [
    'G90',
    'M83',
    'G1 Z0.2 F600',
    'G1 X10 Y10 F3000',
    'G1 X30 Y10 E1 F600 ; 2 s per side',
    'G1 X30 Y30 E1',
    'G1 X10 Y30 E1',
    'G1 X10 Y10 E1',
    'G1 Z0.4',
    'G1 X30 Y10 E1',
    'G1 X30 Y30 E1',
    'G1 X10 Y30 E1',
    'G1 X10 Y10 E1',
].join('\n');

function onSquare(p: { x: number; y: number }): boolean {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const within = (v: number) => v > 10 - 0.01 && v < 30 + 0.01;
    return ((near(p.x, 10) || near(p.x, 30)) && within(p.y)) || ((near(p.y, 10) || near(p.y, 30)) && within(p.x));
}

const certs = path.join(__dirname, '..', 'certs');
const gcode = {
    getByFilename: async () => null,
    findOpenJob: async () => null,
    startJob: async () => 'job-1',
    finishJob: async () => undefined,
} as unknown as GcodeService;

async function until<T>(read: () => T | null | undefined, timeoutMs = 8000): Promise<T> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        const v = read();
        if (v) return v;
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('timed out');
}

describe('live position against the fake printer', () => {
    const fake = new FakePrinter({ httpPort: 0, mqttPort: 0 });
    let bridge: PrinterBridge;
    let httpPort = 0;
    const positions: NonNullable<PrinterLiveState['position']>[] = [];

    beforeAll(async () => {
        const ports = await fake.start();
        httpPort = ports.httpPort;
        const mqttPort = ports.mqttPort;
        const config = {
            id: 'fake',
            name: 'Fake Kobra',
            ip: '127.0.0.1',
            mqttPort,
            username: 'fake-user',
            password: 'fake-password',
            deviceId: 'fake-printer',
            modeId: '20028',
            httpPort: 0,
            settings: printerSettingsSchema.parse({ pollIntervalSec: 1, cameraAlwaysOn: false }),
        } as unknown as BridgePrinterConfig;
        bridge = new PrinterBridge(config, gcode, {
            cert: fs.readFileSync(path.join(certs, 'anycubic_slicer.crt')),
            key: fs.readFileSync(path.join(certs, 'anycubic_slicer.key')),
        });
        bridge.on('state', (s: PrinterLiveState) => {
            const last = positions[positions.length - 1];
            if (s.position && (s.position.x !== last?.x || s.position.y !== last?.y)) positions.push(s.position);
        });
        bridge.start();
    });

    afterAll(async () => {
        await bridge.stop();
        fake.stop();
    });

    it('reads a moving position every second while printing', async () => {
        await until(() => positions.length >= 3);
        const [a, b] = positions;
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0.1);
        const s = bridge.snapshot();
        expect(s.printState).toBe('printing');
        expect(s.zMm).toBe(s.position?.z ?? -1);
    }, 15000);

    it('exposes the real position to Moonraker clients', () => {
        const pos = bridge.snapshot().position;
        const moon = new MoonrakerService(
            bridge,
            gcode,
            { library: () => [], resolveSlot: () => ({ profile: null }) } as never,
            {} as never,
            {} as never,
        );
        const objects = moon.printerObjects() as { toolhead: { position: number[] } };
        expect(objects.toolhead.position.slice(0, 3)).toEqual([pos?.x, pos?.y, pos?.z]);
    });

    it('stops polling and clears the position once the print is cancelled', async () => {
        await bridge.cancel();
        await until(() => bridge.snapshot().printState !== 'printing' && bridge.snapshot().position === null);
        const count = positions.length;
        await new Promise((r) => setTimeout(r, 2500));
        expect(positions.length).toBe(count);
    }, 15000);

    it('replays an uploaded gcode so the nozzle stays on the part', async () => {
        const sent = await uploadGcode(
            '127.0.0.1',
            'http://fake/gcode_upload?s=fake',
            'square.gcode',
            Buffer.from(SQUARE),
            {
                port: httpPort,
            },
        );
        expect(uploadAccepted(sent)).toBe(true);
        const client = (bridge as unknown as { client: KobraMqttClient }).client;
        await client.request('print', 'start', { filename: 'square.gcode' });
        await new Promise((r) => setTimeout(r, 1500));
        positions.length = 0;
        await until(() => positions.length >= 3);
        for (const p of positions) {
            expect(onSquare(p)).toBe(true);
            expect(p.z).toBe(0.2);
        }
        expect(bridge.snapshot()).toMatchObject({ currLayer: 1, totalLayers: 2 });
    }, 15000);

    it('reports the filament and part fan the gcode switches to', async () => {
        await bridge.cancel();
        await until(() => bridge.snapshot().printState !== 'printing');
        const text = ['M106 S128', 'T1', SQUARE].join('\n');
        const sent = await uploadGcode(
            '127.0.0.1',
            'http://fake/gcode_upload?s=fake',
            'tool.gcode',
            Buffer.from(text),
            {
                port: httpPort,
            },
        );
        expect(uploadAccepted(sent)).toBe(true);
        const client = (bridge as unknown as { client: KobraMqttClient }).client;
        await client.request('print', 'start', { filename: 'tool.gcode' });
        await until(() => bridge.snapshot().amsLoadedSlot === 1 && bridge.snapshot().fanSpeed === 50);
    }, 15000);

    it('prints each tool from the slot of the start mapping, or else the slot of the gcode colour', async () => {
        const client = (bridge as unknown as { client: KobraMqttClient }).client;
        const run = async (name: string, header: string, start: Record<string, unknown>, slot: number) => {
            await bridge.cancel();
            await until(() => bridge.snapshot().printState !== 'printing');
            const text = [header, SQUARE].join('\n');
            const sent = await uploadGcode('127.0.0.1', 'http://fake/gcode_upload?s=fake', name, Buffer.from(text), {
                port: httpPort,
            });
            expect(uploadAccepted(sent)).toBe(true);
            await client.request('print', 'start', { filename: name, ...start });
            await until(() => bridge.snapshot().amsLoadedSlot === slot);
        };
        await run('colour.gcode', '; filament_colour = #2878DC', {}, 4);
        const mapping = { ams_settings: { use_ams: true, ams_box_mapping: [{ paint_index: 0, ams_index: 9 }] } };
        await run('mapped.gcode', '; filament_colour = #2878DC', mapping, 8);
    }, 20000);
});

describe('fake printer toolpath', () => {
    it('times the moves from their feed rates and counts the extruded layers', () => {
        const path = parseToolpath(SQUARE);
        expect(path.layers).toBe(2);
        expect(path.totalSec).toBeCloseTo(0.02 + Math.hypot(10, 10) / 50 + 8 + 0.02 + 8, 3);
        const firstExtrusion = path.t[2];
        expect(toolpathPosition(path, firstExtrusion + 3)).toEqual({ x: 30, y: 20, z: 0.2 });
    });

    it('follows the tool changes and the part fan of the gcode', () => {
        const path = parseToolpath(['M106 S128', 'G1 X10 E1 F600', 'T2', 'M107', 'G1 X20 E1'].join('\n'));
        expect(path.tool.slice(1)).toEqual([0, 2]);
        expect(path.fan.slice(1)).toEqual([50, 0]);
    });
});
