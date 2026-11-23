import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:net';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

let server: Server;
let open = 0;
let closed = 0;

beforeAll(async () => {
    server = createServer((s) => s.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    open = (server.address() as AddressInfo).port;
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    closed = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
});

afterAll(() => {
    server.close();
});

function reachable(port: number) {
    const config = { id: 'p1', name: 'Kobra 4', ip: '127.0.0.1', mqttPort: port, settings: {} } as BridgePrinterConfig;
    const bridge = new PrinterBridge(config, {} as GcodeService, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    return (bridge as unknown as { printerReachable: () => Promise<boolean> }).printerReachable();
}

describe('printerReachable', () => {
    it('is true when the MQTT port accepts a connection', async () => {
        expect(await reachable(open)).toBe(true);
    });

    it('is false, without throwing, when the port refuses it', async () => {
        expect(await reachable(closed)).toBe(false);
    });
});
