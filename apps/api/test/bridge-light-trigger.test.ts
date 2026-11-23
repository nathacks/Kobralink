import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

function bridge() {
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
    const b = new PrinterBridge(config, {} as GcodeService, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    let triggers = 0;
    b.on('light_trigger', () => {
        triggers += 1;
    });
    const internals = b as unknown as { onReport: (suffix: string, payload: Record<string, unknown>) => void };
    const tap = (status: number) => internals.onReport('light/report', { action: 'control', data: { status } });
    return { b, tap, triggers: () => triggers };
}

const t0 = new Date('2026-10-30T12:00:00.000Z').getTime();
const at = (sec: number) => setSystemTime(new Date(t0 + sec * 1000));

afterEach(() => setSystemTime());

describe('light trigger', () => {
    it('fires on three light switches from the printer screen within 20 s', () => {
        const h = bridge();
        at(0);
        h.tap(1);
        at(3);
        h.tap(0);
        expect(h.triggers()).toBe(0);
        at(6);
        h.tap(1);
        expect(h.triggers()).toBe(1);
        expect(h.b.snapshot().lightOn).toBe(true);
    });

    it('counts a switch even when the printer merges taps into the same state', () => {
        const h = bridge();
        at(0);
        h.tap(1);
        at(2);
        h.tap(1);
        at(4);
        h.tap(1);
        expect(h.triggers()).toBe(1);
    });

    it('forgets switches older than 20 s and starts over after firing', () => {
        const h = bridge();
        at(0);
        h.tap(1);
        at(15);
        h.tap(0);
        at(25);
        h.tap(1);
        expect(h.triggers()).toBe(0);
        at(30);
        h.tap(0);
        expect(h.triggers()).toBe(1);
        at(31);
        h.tap(1);
        at(32);
        h.tap(0);
        expect(h.triggers()).toBe(1);
    });

    it('ignores the replies to the light commands FarolPrint sends', () => {
        const h = bridge();
        (h.b as unknown as { client: { connected: boolean; setLight: () => void } }).client = {
            connected: true,
            setLight: () => undefined,
        };
        at(0);
        h.b.setLight(true);
        h.tap(1);
        at(2);
        h.b.setLight(false);
        h.tap(0);
        at(4);
        h.b.setLight(true);
        h.tap(1);
        expect(h.triggers()).toBe(0);
    });
});

describe('setLight', () => {
    function lit(stored: number) {
        const h = bridge();
        const sent: [boolean, number][] = [];
        (h.b as unknown as { client: { connected: boolean; setLight: (on: boolean, b: number) => void } }).client = {
            connected: true,
            setLight: (on, b) => {
                sent.push([on, b]);
            },
        };
        (h.b as unknown as { onReport: (s: string, p: Record<string, unknown>) => void }).onReport('light/report', {
            action: 'control',
            data: { status: 0, brightness: stored },
        });
        return { b: h.b, sent };
    }

    it('turns the light on at full brightness when the printer reported it at 0', () => {
        const h = lit(0);
        h.b.setLight(true);
        expect(h.sent).toEqual([[true, 100]]);
        expect(h.b.snapshot()).toMatchObject({ lightOn: true, lightBrightness: 100 });
    });

    it('keeps the brightness the printer last reported', () => {
        const h = lit(60);
        h.b.setLight(true);
        expect(h.sent).toEqual([[true, 60]]);
    });

    it('uses the brightness a macro asks for, but never 0 to turn it on', () => {
        const h = lit(60);
        h.b.setLight(true, 30);
        h.b.setLight(true, 0);
        expect(h.sent).toEqual([
            [true, 30],
            [true, 100],
        ]);
    });

    it('sends brightness 0 to turn it off, like the official client', () => {
        const h = lit(80);
        h.b.setLight(false);
        expect(h.sent).toEqual([[false, 0]]);
        expect(h.b.snapshot()).toMatchObject({ lightOn: false, lightBrightness: 0 });
    });
});
