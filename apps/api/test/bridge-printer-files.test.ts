import { describe, expect, it, mock } from 'bun:test';
import type { PrintStartPayload } from '@kobralink/kobra-protocol';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

type Listing = { code: number; records: Record<string, unknown>[] };

function setup(listings: Record<string, Listing>) {
    const gcode = {
        getByFilename: async () => null,
        findOpenJob: async () => null,
        startJob: async () => 'job-1',
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
        settings: { autoLeveling: false, vibrationCompensation: false, flowCalibration: false },
    } as unknown as BridgePrinterConfig;
    const bridge = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    const paths: string[] = [];
    const details: string[] = [];
    const internals = bridge as unknown as {
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
        ensureConnected: () => void;
        client: {
            listLocalFiles: (path?: string) => void;
            requestFileDetails: (filename: string) => void;
            startPrint: (payload: PrintStartPayload) => Promise<unknown>;
        };
        log: { log: (m: string) => void };
    };
    const startPrint = mock(async (_payload: PrintStartPayload) => ({ state: 'success', code: 0 }));
    internals.ensureConnected = () => {};
    internals.log.log = () => {};
    internals.client.listLocalFiles = (path = '/') => {
        paths.push(path);
        const listing = listings[path] ?? { code: 10001, records: [] };
        internals.onReport('file/report', {
            action: 'listLocal',
            state: 'done',
            code: listing.code,
            data: { list_mode: 0, records: listing.records },
        });
    };
    internals.client.requestFileDetails = (filename: string) => {
        details.push(filename);
        internals.onReport('file/report', {
            action: 'fileDetails',
            state: 'done',
            code: 200,
            data: { file_details: { thumbnail: `thumb-of-${filename}` } },
        });
    };
    internals.client.startPrint = startPrint;
    const sent = () => (startPrint.mock.calls[0] as [PrintStartPayload])[0];
    return { bridge, paths, details, startPrint, sent };
}

const root = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ filename: `part-${i}.gcode`, is_dir: false, size: 100 + i, timestamp: i }));

const models: Listing = {
    code: 200,
    records: [
        { filename: 'Shark_plate(01)_PLA_0.2_48m26s.gcode', is_dir: false, size: 2524965, timestamp: 1778582667 },
        { filename: '3DBenchy_plate(01)_PLA_0.2_45m37s.gcode', is_dir: false, size: 3118538, timestamp: 1778582667 },
    ],
};

describe('listPrinterFiles', () => {
    it('lists the root files newest first and the test models apart', async () => {
        const h = setup({
            '/': {
                code: 200,
                records: [
                    { filename: 'old.gcode', is_dir: false, size: 10, timestamp: 100 },
                    { filename: 'folder', is_dir: true, size: 0, timestamp: 300 },
                    { filename: 'new.gcode', is_dir: false, size: 20, timestamp: 200 },
                ],
            },
            '/test_model': models,
        });
        const list = await h.bridge.listPrinterFiles();
        expect(h.paths).toEqual(['/', '/test_model']);
        expect(list.files).toEqual([
            { filename: 'new.gcode', sizeBytes: 20, timestamp: 200, folder: null },
            { filename: 'old.gcode', sizeBytes: 10, timestamp: 100, folder: null },
        ]);
        expect(list.testModels.map((f) => [f.filename, f.folder])).toEqual([
            ['Shark_plate(01)_PLA_0.2_48m26s.gcode', 'test_model'],
            ['3DBenchy_plate(01)_PLA_0.2_45m37s.gcode', 'test_model'],
        ]);
        expect(list.truncated).toBe(false);
    });

    it('flags a listing that reached the 256 files the printer returns at most', async () => {
        const h = setup({ '/': { code: 200, records: root(256) }, '/test_model': models });
        const list = await h.bridge.listPrinterFiles();
        expect(list.files).toHaveLength(256);
        expect(list.truncated).toBe(true);
        const fewer = setup({ '/': { code: 200, records: root(255) }, '/test_model': models });
        expect((await fewer.bridge.listPrinterFiles()).truncated).toBe(false);
    });

    it('shows no test models when the printer refuses that folder', async () => {
        const h = setup({ '/': { code: 200, records: root(2) } });
        const list = await h.bridge.listPrinterFiles();
        expect(list.files).toHaveLength(2);
        expect(list.testModels).toEqual([]);
    });

    it('fails when the printer refuses the root listing', async () => {
        const h = setup({ '/': { code: 10001, records: [] } });
        await expect(h.bridge.listPrinterFiles()).rejects.toThrow();
        expect(h.paths).toEqual(['/']);
    });
});

describe('printerFileThumbnail', () => {
    it('asks for a test model with its folder and caches it by path', async () => {
        const h = setup({});
        expect(await h.bridge.printerFileThumbnail('test_model/Shark.gcode')).toBe('thumb-of-test_model/Shark.gcode');
        expect(await h.bridge.printerFileThumbnail('test_model/Shark.gcode')).toBe('thumb-of-test_model/Shark.gcode');
        expect(h.details).toEqual(['test_model/Shark.gcode']);
    });
});

describe('printPrinterFile', () => {
    it('starts a root file by its name', async () => {
        const h = setup({});
        await h.bridge.printPrinterFile('part.gcode', 2048);
        expect(h.sent()).toMatchObject({ filename: 'part.gcode', filepath: '/part.gcode', filesize: 2048 });
        expect(h.bridge.snapshot().filename).toBe('part.gcode');
    });

    it('starts a test model with its folder in the file path', async () => {
        const h = setup({});
        await h.bridge.printPrinterFile('test_model/Shark.gcode', 2524965);
        expect(h.sent()).toMatchObject({ filename: 'Shark.gcode', filepath: '/test_model/Shark.gcode' });
        expect(h.bridge.snapshot().filename).toBe('/test_model/Shark.gcode');
    });

    it('refuses a path outside the root and the test models', async () => {
        const h = setup({});
        await expect(h.bridge.printPrinterFile('other/part.gcode', 1)).rejects.toThrow();
        await expect(h.bridge.printPrinterFile('../part.gcode', 1)).rejects.toThrow();
        expect(h.startPrint).not.toHaveBeenCalled();
    });
});
