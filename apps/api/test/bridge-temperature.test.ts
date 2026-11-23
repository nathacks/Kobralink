import { describe, expect, it, mock } from 'bun:test';
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
    const client = {
        connected: true,
        setIdleTemperature: mock((_nozzle?: number, _bed?: number) => undefined),
        setPrintingTemperature: mock((_taskid: string, _nozzle?: number, _bed?: number) => undefined),
    };
    const internals = b as unknown as {
        client: typeof client;
        s: { printState: string; taskId: string };
    };
    internals.client = client;
    const state = (printState: string) => {
        internals.s.printState = printState;
        internals.s.taskId = '-1';
    };
    return { b, client, state };
}

describe('setTemperature', () => {
    it('uses the idle command when no print runs', () => {
        const h = bridge();
        h.state('standby');
        h.b.setTemperature(205, undefined);
        expect(h.client.setIdleTemperature).toHaveBeenCalledWith(205, undefined);
        expect(h.client.setPrintingTemperature).not.toHaveBeenCalled();
    });

    it('goes through the print task while printing', () => {
        const h = bridge();
        h.state('printing');
        h.b.setTemperature(230, 70);
        expect(h.client.setPrintingTemperature).toHaveBeenCalledWith('-1', 230, 70);
        expect(h.client.setIdleTemperature).not.toHaveBeenCalled();
    });

    it('goes through the print task while paused, since the printer refuses the idle command then', () => {
        const h = bridge();
        h.state('paused');
        h.b.setTemperature(205, undefined);
        expect(h.client.setPrintingTemperature).toHaveBeenCalledWith('-1', 205, undefined);
        expect(h.client.setIdleTemperature).not.toHaveBeenCalled();
    });

    it('keeps the new targets in the live state', () => {
        const h = bridge();
        h.state('paused');
        h.b.setTemperature(205, 75);
        expect(h.b.snapshot().nozzleTarget).toBe(205);
        expect(h.b.snapshot().bedTarget).toBe(75);
    });
});
