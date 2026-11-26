import { describe, expect, it, mock } from 'bun:test';
import type { KobraMessage } from '@kobralink/kobra-protocol';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

function bridge(printState: string) {
    const config = {
        id: 'printer-1',
        name: 'Kobra X',
        ip: '127.0.0.1',
        mqttPort: 9883,
        username: 'u',
        password: 'p',
        deviceId: 'd',
        modeId: '20030',
        httpPort: 7125,
        settings: {},
    } as unknown as BridgePrinterConfig;
    const b = new PrinterBridge(config, {} as GcodeService, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    const client = { connected: true, queryAxis: mock(() => Promise.resolve(null)) };
    const internals = b as unknown as {
        client: typeof client;
        offline: boolean;
        s: { printState: string };
        onReport: (suffix: string, payload: KobraMessage) => void;
        pollPosition: () => void;
    };
    internals.client = client;
    internals.offline = false;
    internals.s.printState = printState;
    const report = (data: unknown, extra: Partial<KobraMessage> = {}) =>
        internals.onReport('axis/report', {
            type: 'axis',
            action: 'query',
            state: 'done',
            data,
            ...extra,
        } as KobraMessage);
    return { b, client, internals, report };
}

describe('live toolhead position', () => {
    it('stores the reported position while printing and uses its z', () => {
        const h = bridge('printing');
        h.report({ x: 132.495, y: 128.41700000001, z: 1.4849999999999999 });
        expect(h.b.snapshot().position).toEqual({ x: 132.495, y: 128.417, z: 1.485 });
        expect(h.b.snapshot().zMm).toBe(1.485);
    });

    it('ignores failed, incomplete and out-of-print reports', () => {
        const h = bridge('printing');
        h.report({ x: 1, y: 2, z: 3 }, { state: 'failed' });
        h.report({ x: 1, y: 2 });
        expect(h.b.snapshot().position).toBeNull();
        const idle = bridge('standby');
        idle.report({ x: -17.5, y: 260, z: 137 });
        expect(idle.b.snapshot().position).toBeNull();
    });

    it('polls only while printing and clears the position afterwards', () => {
        const h = bridge('printing');
        h.internals.pollPosition();
        expect(h.client.queryAxis).toHaveBeenCalledTimes(1);
        h.report({ x: 1, y: 2, z: 3 });
        h.internals.s.printState = 'complete';
        h.internals.pollPosition();
        expect(h.client.queryAxis).toHaveBeenCalledTimes(1);
        expect(h.b.snapshot().position).toBeNull();
    });
});
