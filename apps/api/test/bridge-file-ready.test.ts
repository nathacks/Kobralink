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
    const internals = b as unknown as {
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
        s: { fileReady: string; fileReadyTs: number };
    };
    const report = async (suffix: string, payload: Record<string, unknown>) => {
        internals.onReport(suffix, payload);
        await new Promise((r) => setTimeout(r, 0));
    };
    const markReady = (filename: string) => {
        internals.s.fileReady = filename;
        internals.s.fileReadyTs = Date.now();
    };
    return { b, report, markReady };
}

describe('file ready for the print start dialog', () => {
    it('keeps a file sent while printing ready after the current print ends', async () => {
        const { b, report, markReady } = bridge();
        await report('print/report', { state: 'printing', data: { filename: 'current.gcode' } });
        markReady('next.gcode');
        await report('print/report', { state: 'finished', data: { filename: 'current.gcode' } });
        await report('info/report', { data: { state: 'finished', project: { filename: 'current.gcode' } } });
        expect(b.snapshot().fileReady).toBe('next.gcode');
    });

    it('clears the file once that file has been printed from the printer screen', async () => {
        const { b, report, markReady } = bridge();
        markReady('part.gcode');
        await report('print/report', { state: 'printing', data: { filename: 'part.gcode' } });
        await report('print/report', { state: 'finished', data: { filename: 'part.gcode' } });
        expect(b.snapshot().fileReady).toBe('');
    });

    it('clears the file when the info report says that file ended', async () => {
        const { b, report, markReady } = bridge();
        markReady('part.gcode');
        await report('info/report', { data: { state: 'canceled', project: { filename: 'part.gcode' } } });
        expect(b.snapshot().fileReady).toBe('');
    });
});
