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
    const skipObjects = mock(async (_names: string[]) => ({ state: 'success' }) as Record<string, unknown> | null);
    const internals = b as unknown as {
        client: { connected: boolean; skipObjects: typeof skipObjects };
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
    };
    internals.client = { connected: true, skipObjects };
    return { b, skipObjects, report: internals.onReport.bind(b) };
}

describe('skipObjects', () => {
    it('sends the new parts together with the parts already skipped, like the official client', async () => {
        const { b, skipObjects, report } = bridge();
        report('print/report', { state: 'printing', data: { filename: 'plate.gcode' } });
        report('skip/report', { action: 'query_obj', data: { objects_skip_parts: ['part_1'] } });
        await b.skipObjects(['part_3', 'part_1']);
        expect(skipObjects).toHaveBeenCalledWith(['part_1', 'part_3']);
    });

    it('sends only the new parts when nothing was skipped yet', async () => {
        const { b, skipObjects } = bridge();
        await b.skipObjects(['part_2']);
        expect(skipObjects).toHaveBeenCalledWith(['part_2']);
    });

    it('reports a refusal from the printer', async () => {
        const { b, skipObjects } = bridge();
        skipObjects.mockResolvedValueOnce({ state: 'failed', code: 10102, msg: 'no task' });
        await expect(b.skipObjects(['part_2'])).rejects.toThrow('10102');
    });
});
