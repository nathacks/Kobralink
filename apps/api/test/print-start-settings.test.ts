import { describe, expect, it, mock } from 'bun:test';
import type { PrintStartPayload } from '@farolprint/kobra-protocol';
import { printerSettingsSchema } from '@farolprint/shared';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService, StoredFile } from '../src/gcode/gcode.service';

const file = {
    id: 'file-1',
    filename: 'bracket.gcode',
    md5: 'abc123',
    sizeBytes: 1024,
    estPrintTimeSec: 600,
    layerHeight: 0.2,
    firstLayerHeight: 0.2,
    thumbnail: null,
    filaments: [],
    objects: [],
} as unknown as StoredFile;

function setup(settings: { autoLeveling: boolean; vibrationCompensation: boolean; flowCalibration?: boolean }) {
    const gcode = {
        readData: async () => ({ file, data: Buffer.alloc(file.sizeBytes) }),
        getByFilename: async () => null,
        findOpenJob: async () => null,
        startJob: async () => 'job-1',
    } as unknown as GcodeService;
    const config = {
        id: 'printer-1',
        name: 'Workshop',
        ip: '127.0.0.1',
        mqttPort: 9883,
        username: 'u',
        password: 'p',
        deviceId: 'd',
        modeId: '20028',
        model: 'Anycubic Kobra 4',
        httpPort: 7125,
        settings,
    } as unknown as BridgePrinterConfig;
    const bridge = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    const startPrint = mock(async (_payload: PrintStartPayload) => ({ state: 'success', code: 0 }));
    const log = mock((_msg: string) => undefined);
    const internals = bridge as unknown as {
        ensureConnected: () => void;
        pushToPrinter: () => Promise<void>;
        client: { startPrint: typeof startPrint };
        log: { log: typeof log };
    };
    internals.ensureConnected = () => {};
    internals.pushToPrinter = async () => {};
    internals.client.startPrint = startPrint;
    internals.log.log = log;
    const sent = () => (startPrint.mock.calls[0] as [PrintStartPayload])[0].task_settings;
    const logged = () => log.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('print/start')) ?? '';
    return { bridge, sent, logged };
}

const serveBase = 'http://127.0.0.1:7125';

describe('print/start task settings', () => {
    it('sends the options chosen in the dialog over the printer settings', async () => {
        const h = setup({ autoLeveling: true, vibrationCompensation: true });
        await h.bridge.printStoredFile(file.id, { serveBase, autoLeveling: false, vibrationCompensation: false });
        expect(h.sent()).toMatchObject({ auto_leveling: 0, vibration_compensation: 0 });
    });

    it('falls back to the printer settings when no option is given', async () => {
        const h = setup({ autoLeveling: true, vibrationCompensation: true });
        await h.bridge.printStoredFile(file.id, { serveBase });
        expect(h.sent()).toMatchObject({ auto_leveling: 1, vibration_compensation: 1 });
    });

    it('logs the task settings sent with a stored file', async () => {
        const h = setup({ autoLeveling: false, vibrationCompensation: false });
        await h.bridge.printStoredFile(file.id, { serveBase });
        expect(h.logged()).toContain('bracket.gcode');
        expect(h.logged()).toContain(`task_settings=${JSON.stringify(h.sent())}`);
    });

    it('logs the task settings sent with a file already on the printer', async () => {
        const h = setup({ autoLeveling: false, vibrationCompensation: false });
        await h.bridge.printPrinterFile('on-printer.gcode', 2048, true);
        expect(h.sent()).toMatchObject({ auto_leveling: 1, vibration_compensation: 0 });
        expect(h.logged()).toContain('on-printer.gcode');
        expect(h.logged()).toContain(`task_settings=${JSON.stringify(h.sent())}`);
    });

    it('runs flow calibration by default, from the printer settings', async () => {
        const h = setup(printerSettingsSchema.parse({}));
        await h.bridge.printStoredFile(file.id, { serveBase });
        expect(h.sent()).toMatchObject({ flow_calibration: 1 });
    });

    it('skips flow calibration when the dialog turns it off for one print', async () => {
        const h = setup({ autoLeveling: true, vibrationCompensation: false, flowCalibration: true });
        await h.bridge.printStoredFile(file.id, { serveBase, flowCalibration: false });
        expect(h.sent()).toMatchObject({ flow_calibration: 0, auto_leveling: 1 });
    });

    it('follows a printer that has flow calibration off', async () => {
        const h = setup({ autoLeveling: true, vibrationCompensation: false, flowCalibration: false });
        await h.bridge.printStoredFile(file.id, { serveBase });
        expect(h.sent()).toMatchObject({ flow_calibration: 0 });
        const on = setup({ autoLeveling: true, vibrationCompensation: false, flowCalibration: false });
        await on.bridge.printStoredFile(file.id, { serveBase, flowCalibration: true });
        expect(on.sent()).toMatchObject({ flow_calibration: 1 });
    });

    it('uses the printer setting for a file already on the printer', async () => {
        const h = setup({ autoLeveling: false, vibrationCompensation: false, flowCalibration: true });
        await h.bridge.printPrinterFile('on-printer.gcode', 2048);
        expect(h.sent()).toMatchObject({ flow_calibration: 1 });
    });
});
