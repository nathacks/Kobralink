import { describe, expect, it } from 'bun:test';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

function bridge() {
    const gcode = {
        getByFilename: async () => null,
        findOpenJob: async () => null,
        setJobPaused: async () => undefined,
        startJob: async () => 'job-1',
        closeOpenJobs: async () => 0,
        finishJob: async () => undefined,
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
    const b = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    const internals = b as unknown as { onReport: (suffix: string, payload: Record<string, unknown>) => void };
    const report = async (suffix: string, payload: Record<string, unknown>) => {
        internals.onReport(suffix, payload);
        await new Promise((r) => setTimeout(r, 0));
    };
    return { b, report };
}

describe('unknown Kobra states', () => {
    it('keep the print state instead of flipping between printing and standby', async () => {
        const { b, report } = bridge();
        await report('print/report', { state: 'printing', data: { filename: 'part.gcode' } });
        expect(b.snapshot().printState).toBe('printing');
        await report('info/report', { data: { state: 'mystery' } });
        expect(b.snapshot()).toMatchObject({ printState: 'printing', kobraState: 'mystery' });
        await report('print/report', { state: 'mystery', data: { filename: 'part.gcode' } });
        expect(b.snapshot().printState).toBe('printing');
        await report('print/report', { state: 'finished', data: { filename: 'part.gcode' } });
        await report('info/report', { data: { state: 'mystery' } });
        expect(b.snapshot().printState).toBe('complete');
    });

    it('fall back to the source of the message right after connecting', async () => {
        const fromInfo = bridge();
        await fromInfo.report('info/report', { data: { state: 'mystery' } });
        expect(fromInfo.b.snapshot().printState).toBe('standby');
        const fromPrint = bridge();
        await fromPrint.report('print/report', { state: 'mystery', data: { filename: 'part.gcode' } });
        expect(fromPrint.b.snapshot().printState).toBe('printing');
    });
});
