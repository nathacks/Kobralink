import { describe, expect, it } from 'bun:test';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

function setup() {
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
    const bridge = new PrinterBridge(config, {} as GcodeService, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    const lines: string[] = [];
    const internals = bridge as unknown as {
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
        logPrintQuery: (ms: number | null) => void;
        log: { log: (m: string) => void };
        s: { filename: string };
    };
    internals.log.log = (m: string) => {
        lines.push(m);
    };
    const info = (data: Record<string, unknown>) => internals.onReport('info/report', { action: 'report', data });
    const print = (state: string, data: Record<string, unknown>) =>
        internals.onReport('print/report', { action: 'update', state, data });
    return { bridge, lines, info, print, internals };
}

describe('diagnostic logs for the next print', () => {
    it('logs the extra fans once, then again when they change', () => {
        const h = setup();
        h.info({ aux_fan_speed_pct: 0, fan_speed_pct: 0 });
        h.info({ aux_fan_speed_pct: 0, fan_speed_pct: 20 });
        h.info({ aux_fan_speed_pct: 40 });
        expect(h.lines.filter((l) => l.startsWith('Extra fans'))).toEqual([
            'Extra fans reported by the printer: {"aux_fan_speed_pct":0}',
            'Extra fans reported by the printer: {"aux_fan_speed_pct":40}',
        ]);
    });

    it('logs nothing about extra fans a printer does not report', () => {
        const h = setup();
        h.info({ fan_speed_pct: 0 });
        expect(h.lines.some((l) => l.startsWith('Extra fans'))).toBe(false);
    });

    it('logs what an updated report carries once per shape, not at every fan change', () => {
        const h = setup();
        h.print('updated', { settings: { fan_speed_pct: 100, z_comp: 0 }, taskid: '7' });
        h.print('updated', { settings: { fan_speed_pct: 30, z_comp: 0 }, taskid: '7' });
        h.print('updated', { settings: { fan_speed_pct: 90, z_comp: 0 }, taskid: '7', localtask: 1 });
        h.print('updated', { settings: { fan_speed_pct: 60, z_comp: 0 }, taskid: '7', localtask: 1 });
        expect(h.lines.filter((l) => l.includes('(updated)'))).toEqual([
            'Print settings acknowledged by the printer (updated): {"settings":{"fan_speed_pct":100,"z_comp":0},"keys":["settings","taskid"]}',
            'Print settings acknowledged by the printer (updated): {"settings":{"fan_speed_pct":90,"z_comp":0},"keys":["localtask","settings","taskid"]}',
        ]);
    });

    it('logs whether print/query got an answer, once per print', () => {
        const h = setup();
        h.internals.s.filename = 'part.gcode';
        h.internals.logPrintQuery(120);
        h.internals.logPrintQuery(null);
        h.internals.s.filename = 'next.gcode';
        h.internals.logPrintQuery(null);
        expect(h.lines.filter((l) => l.startsWith('print/query'))).toEqual([
            'print/query while printing: a print report came back after 120 ms',
            'print/query while printing: no print report within 3 s',
        ]);
    });

    it('hides the upload and camera tokens in the announced URLs', () => {
        const h = setup();
        h.info({
            urls: {
                fileUploadurl: 'http://192.0.2.10:18910/gcode_upload?s=AbC123',
                rtspUrl: 'http://192.0.2.10:18088/live/0123456789abcdef',
            },
        });
        const line = h.lines.find((l) => l.startsWith('URLs announced')) ?? '';
        expect(line).toContain('gcode_upload?s=…');
        expect(line).toContain('/live/…');
        expect(line).not.toContain('AbC123');
        expect(line).not.toContain('0123456789abcdef');
    });
});
