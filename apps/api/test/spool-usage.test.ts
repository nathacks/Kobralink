import { describe, expect, it } from 'bun:test';
import { type BridgePrinterConfig, type FilamentUsageSink, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

interface Harness {
    bridge: PrinterBridge;
    report: (suffix: string, payload: Record<string, unknown>) => Promise<void>;
    calls: { spoolId: string | number; mm: number }[];
    setSpool: (spoolId: number) => void;
}

function harness(syncRateSec = 0): Harness {
    const calls: { spoolId: string | number; mm: number }[] = [];
    let map = new Map<number, number>([[0, 1]]);
    const sink: FilamentUsageSink = {
        name: 'spoolman',
        syncRateSec,
        slotMap: () => map,
        useFilament: async (spoolId, mm) => {
            calls.push({ spoolId, mm: Math.round(mm) });
        },
    };
    const gcode = {
        getByFilename: async () => null,
        findOpenJob: async () => null,
        startJob: async () => 'job-1',
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
    const bridge = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) }, [sink]);
    const internals = bridge as unknown as {
        s: { connected: boolean };
        onReport: (suffix: string, payload: Record<string, unknown>) => void;
    };
    internals.s.connected = true;
    return {
        bridge,
        calls,
        report: async (suffix, payload) => {
            internals.onReport(suffix, payload);
            await new Promise((r) => setTimeout(r, 0));
        },
        setSpool: (spoolId) => {
            bridge.resetSpoolUsage();
            map = new Map([[0, spoolId]]);
        },
    };
}

const printing = (mm: number) => ({ state: 'printing', data: { filename: 'part.gcode', supplies_usage: mm } });
const finished = (mm: number) => ({ state: 'finished', data: { filename: 'part.gcode', supplies_usage: mm } });
const noAce = { state: 'success', data: { multi_color_box: [] } };

const totals = (calls: { spoolId: string | number; mm: number }[]) => {
    const out: Record<string, number> = {};
    for (const c of calls) out[String(c.spoolId)] = (out[String(c.spoolId)] ?? 0) + c.mm;
    return out;
};

describe('external spool detection', () => {
    it('flags the printer as external-spool-only when multiColorBox reports no box', async () => {
        const h = harness();
        expect(h.bridge.snapshot().externalSpoolOnly).toBe(false);
        await h.report('multiColorBox/report', noAce);
        expect(h.bridge.snapshot().externalSpoolOnly).toBe(true);
    });
});

describe('filament usage without an ACE', () => {
    it('reports the whole print to the mapped spool when it ends', async () => {
        const h = harness();
        await h.report('multiColorBox/report', noAce);
        await h.report('print/report', printing(0));
        await h.report('print/report', printing(2000));
        await h.report('print/report', finished(5000));
        expect(totals(h.calls)).toEqual({ '1': 5000 });
    });

    it('syncs usage while printing when a sync rate is set', async () => {
        const h = harness(1);
        await h.report('multiColorBox/report', noAce);
        await h.report('print/report', printing(0));
        await h.report('print/report', printing(2000));
        expect(totals(h.calls)).toEqual({ '1': 2000 });
    });

    it('splits usage between spools when the spool is changed mid-print', async () => {
        const h = harness();
        await h.report('multiColorBox/report', noAce);
        await h.report('print/report', printing(0));
        await h.report('print/report', printing(2000));
        h.setSpool(2);
        await h.report('print/report', printing(3000));
        await h.report('print/report', finished(3500));
        expect(totals(h.calls)).toEqual({ '1': 2000, '2': 1500 });
    });

    it('does not charge the new spool for earlier usage when nothing is printed after the change', async () => {
        const h = harness();
        await h.report('multiColorBox/report', noAce);
        await h.report('print/report', printing(0));
        await h.report('print/report', printing(2000));
        h.setSpool(2);
        await h.report('print/report', finished(2000));
        expect(totals(h.calls)).toEqual({ '1': 2000 });
    });
});

describe('job usage priced from Spoolman', () => {
    function priced(describe?: FilamentUsageSink['describe']) {
        const finished: unknown[][] = [];
        const sink: FilamentUsageSink = {
            name: 'spoolman',
            syncRateSec: 0,
            slotMap: () => new Map([[0, 12]]),
            useFilament: async () => undefined,
            describe,
        };
        const gcode = {
            getByFilename: async () => null,
            findOpenJob: async () => null,
            startJob: async () => 'job-1',
            finishJob: async (...args: unknown[]) => {
                finished.push(args);
            },
        } as unknown as GcodeService;
        const config = { id: 'printer-1', name: 'Kobra 4', settings: {} } as unknown as BridgePrinterConfig;
        const bridge = new PrinterBridge(config, gcode, { cert: Buffer.alloc(0), key: Buffer.alloc(0) }, [sink]);
        const internals = bridge as unknown as {
            s: { connected: boolean };
            onReport: (suffix: string, payload: Record<string, unknown>) => void;
        };
        internals.s.connected = true;
        const report = async (suffix: string, payload: Record<string, unknown>) => {
            internals.onReport(suffix, payload);
            await new Promise((r) => setTimeout(r, 5));
        };
        return { finished, report };
    }

    it('freezes the weight and the price of the Spoolman spool when the job ends', async () => {
        const h = priced(async () => ({ gramsPerMm: 0.003, pricePerG: 0.025 }));
        await h.report('multiColorBox/report', noAce);
        await h.report('print/report', printing(0));
        await h.report('print/report', finished(2000));
        const usage = h.finished[0][3] as Record<string, unknown>[];
        expect(usage).toEqual([
            expect.objectContaining({ slotIndex: 0, mm: 2000, spoolmanId: 12, weightG: 6, pricePerG: 0.025 }),
        ]);
    });

    it('keeps the plain usage when Spoolman cannot describe the spool', async () => {
        const h = priced(async () => null);
        await h.report('multiColorBox/report', noAce);
        await h.report('print/report', printing(0));
        await h.report('print/report', finished(500));
        const [entry] = h.finished[0][3] as Record<string, unknown>[];
        expect(entry).toMatchObject({ spoolmanId: 12, mm: 500 });
        expect(entry.weightG).toBeUndefined();
    });
});
