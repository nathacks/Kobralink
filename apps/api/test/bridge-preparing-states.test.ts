import { describe, expect, it, mock } from 'bun:test';
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
    const warn = mock((_msg: string) => undefined);
    const internals = b as unknown as {
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
        log: { warn: typeof warn };
    };
    internals.log.warn = warn;
    const report = async (suffix: string, payload: Record<string, unknown>) => {
        internals.onReport(suffix, payload);
        await new Promise((r) => setTimeout(r, 0));
    };
    return { b, report, warn };
}

describe('preparation states', () => {
    it('know flow calibration, as seen on a Kobra 4 print started from its screen', async () => {
        const { b, report, warn } = bridge();
        await report('print/report', {
            state: 'flow_calibrating',
            data: { filename: '/test_model/3DBenchy.gcode', progress: 37, curr_layer: 0 },
        });
        expect(b.snapshot()).toMatchObject({ printState: 'printing', kobraState: 'flow_calibrating', progress: 0 });
        expect(warn.mock.calls.some(([msg]) => msg.includes('Unknown Kobra state'))).toBe(false);
    });

    it('know the other official and newer firmware preparation steps', async () => {
        const { b, report, warn } = bridge();
        for (const state of ['drying', 'downloading', 'slicing', 'waiting', 'nozzle_wiping', 'z_offset_calibrating']) {
            await report('print/report', { state, data: { filename: 'part.gcode', curr_layer: 0 } });
            expect(b.snapshot()).toMatchObject({ printState: 'printing', kobraState: state, progress: 0 });
        }
        expect(warn).not.toHaveBeenCalled();
    });

    it('keep the progress of a step that happens after the first layer', async () => {
        const { b, report } = bridge();
        await report('print/report', {
            state: 'printing',
            data: { filename: 'part.gcode', progress: 40, curr_layer: 80 },
        });
        await report('print/report', {
            state: 'filament_cutting',
            data: { filename: 'part.gcode', progress: 41, curr_layer: 81 },
        });
        expect(b.snapshot()).toMatchObject({ printState: 'printing', kobraState: 'filament_cutting', progress: 0.41 });
        await report('print/report', { state: 'ace_filament_feeding', data: { filename: 'part.gcode' } });
        expect(b.snapshot().progress).toBe(0.41);
    });

    it('apply the same rule to the info report', async () => {
        const { b, report } = bridge();
        await report('info/report', {
            data: { state: 'busy', project: { state: 'auto_leveling', progress: 12, curr_layer: 0 } },
        });
        expect(b.snapshot()).toMatchObject({ kobraState: 'auto_leveling', progress: 0 });
        await report('info/report', {
            data: { state: 'busy', project: { state: 'nozzle_purging', progress: 55, curr_layer: 120 } },
        });
        expect(b.snapshot()).toMatchObject({ kobraState: 'nozzle_purging', progress: 0.55, currLayer: 120 });
    });
});
