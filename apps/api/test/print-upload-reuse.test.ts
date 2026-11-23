import { describe, expect, it } from 'bun:test';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService, StoredFile } from '../src/gcode/gcode.service';

const file = {
    id: 'file-1',
    filename: 'benchy.gcode',
    md5: 'abc123',
    sizeBytes: 1024,
    path: '/tmp/benchy.gcode',
} as unknown as StoredFile;

interface Internals {
    lastUpload: { filename: string; url: string; md5: string; size: number } | null;
    ensureConnected: () => void;
    pushToPrinter: (f: StoredFile, data: Buffer) => Promise<void>;
    startPrint: (f: StoredFile, opts: unknown) => Promise<void>;
    waitFileAction: (action: string, send: () => void) => Promise<unknown>;
}

function setup(lastUpload: Internals['lastUpload']) {
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
        settings: {},
    } as unknown as BridgePrinterConfig;
    const gcode = { readData: async () => ({ file, data: Buffer.alloc(file.sizeBytes) }) } as unknown as GcodeService;
    const bridge = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
    const internals = bridge as unknown as Internals;
    const calls = { pushed: 0, started: 0 };
    internals.lastUpload = lastUpload;
    internals.ensureConnected = () => {};
    internals.pushToPrinter = async () => {
        calls.pushed += 1;
    };
    internals.startPrint = async () => {
        calls.started += 1;
    };
    return { bridge, internals, calls };
}

const opts = { serveBase: 'http://127.0.0.1:7100' };

describe('printStoredFile upload reuse', () => {
    it('skips the upload when the same file was just pushed to the printer', async () => {
        const { bridge, calls } = setup({ filename: file.filename, url: '', md5: file.md5, size: file.sizeBytes });
        await bridge.printStoredFile(file.id, opts);
        expect(calls.pushed).toBe(0);
        expect(calls.started).toBe(1);
    });

    it('uploads when nothing was pushed before', async () => {
        const { bridge, calls } = setup(null);
        await bridge.printStoredFile(file.id, opts);
        expect(calls.pushed).toBe(1);
        expect(calls.started).toBe(1);
    });

    it('uploads when the stored file differs from the last upload', async () => {
        const { bridge, calls } = setup({ filename: file.filename, url: '', md5: 'other', size: file.sizeBytes });
        await bridge.printStoredFile(file.id, opts);
        expect(calls.pushed).toBe(1);
    });

    it('uploads again on the next attempt when the printer refuses a reused upload', async () => {
        const { bridge, internals, calls } = setup({
            filename: file.filename,
            url: '',
            md5: file.md5,
            size: file.sizeBytes,
        });
        let refuse = true;
        internals.startPrint = async () => {
            if (refuse) throw new Error('refused');
            calls.started += 1;
        };
        await expect(bridge.printStoredFile(file.id, opts)).rejects.toThrow('refused');
        expect(calls.pushed).toBe(0);
        refuse = false;
        await bridge.printStoredFile(file.id, opts);
        expect(calls.pushed).toBe(1);
        expect(calls.started).toBe(1);
    });

    it('forgets the upload once the file is deleted from the printer', async () => {
        const { bridge, internals, calls } = setup({
            filename: file.filename,
            url: '',
            md5: file.md5,
            size: file.sizeBytes,
        });
        internals.waitFileAction = async () => ({ state: 'success', code: 200 });
        await bridge.deletePrinterFiles([file.filename]);
        expect(internals.lastUpload).toBeNull();
        await bridge.printStoredFile(file.id, opts);
        expect(calls.pushed).toBe(1);
    });
});
