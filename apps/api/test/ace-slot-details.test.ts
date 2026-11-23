import { describe, expect, it } from 'bun:test';
import type { KobraColorBox } from '@kobralink/kobra-protocol';
import { aceSlotStatus } from '@kobralink/shared';
import { aggregateAceUnits, aggregateSlots } from '../src/bridge/ams';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

const ace = (slots: Record<string, unknown>[], extra: Record<string, unknown> = {}): KobraColorBox =>
    ({ id: 0, slots, ...extra }) as unknown as KobraColorBox;

const slot = (extra: Record<string, unknown>) => ({ index: 0, status: 5, type: 'PLA', color: [255, 0, 0], ...extra });

describe('ACE slot details', () => {
    it('reads the remaining percentage, the source and the colours of a slot', () => {
        const { slots } = aggregateSlots(
            [
                ace([
                    slot({
                        weight: 20,
                        edit_status: 0,
                        color_group: [
                            [249, 87, 119, 100],
                            [248, 209, 0, 100],
                        ],
                    }),
                ]),
            ],
            'ace_direct',
        );
        expect(slots[0]).toMatchObject({
            remainingPct: 20,
            source: 'rfid',
            colors: [
                [249, 87, 119],
                [248, 209, 0],
            ],
        });
    });

    it('maps the official edit statuses', () => {
        const source = (edit_status: number) =>
            aggregateSlots([ace([slot({ edit_status })])], 'ace_direct').slots[0].source;
        expect(source(0)).toBe('rfid');
        expect(source(1)).toBe('manual');
        expect(source(2)).toBe('unknown');
        expect(source(7)).toBeUndefined();
    });

    it('leaves out what the printer does not report or reports out of range', () => {
        const [plain] = aggregateSlots([ace([slot({})])], 'ace_direct').slots;
        expect(plain.remainingPct).toBeUndefined();
        expect(plain.source).toBeUndefined();
        expect(plain.colors).toBeUndefined();
        const [odd] = aggregateSlots([ace([slot({ weight: 140, color_group: [[1, 2, 3, 100]] })])], 'ace_direct').slots;
        expect(odd.remainingPct).toBeUndefined();
        expect(odd.colors).toBeUndefined();
    });
});

describe('aceSlotStatus', () => {
    it('names the eight official slot statuses', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8].map(aceSlotStatus)).toEqual([
            'feeding',
            'unloading',
            'shifting',
            'no_spool',
            'ready',
            'shift_error',
            'preloading',
            'reading_rfid',
        ]);
        expect(aceSlotStatus(0)).toBeNull();
        expect(aceSlotStatus(9)).toBeNull();
    });
});

describe('ACE drying status', () => {
    const unit = (id: number, status: number) => ace([], { id, drying_status: { status, target_temp: 45 } });

    it('shows the unit that is drying first', () => {
        expect(aggregateAceUnits([unit(0, 0), unit(1, 1)], []).drying.status).toBe(1);
        expect(aggregateAceUnits([unit(0, 2), unit(1, 1)], []).drying.status).toBe(1);
    });

    it('shows a drying fault when no unit is drying', () => {
        expect(aggregateAceUnits([unit(0, 0), unit(1, 2)], []).drying.status).toBe(2);
    });

    it('shows the first unit when none is drying or faulty', () => {
        expect(aggregateAceUnits([unit(0, 0), unit(1, 0)], []).drying.status).toBe(0);
    });
});

describe('ACE drying in the bridge', () => {
    function bridge() {
        const config = {
            id: 'printer-1',
            name: 'Kobra 4',
            ip: '127.0.0.1',
            mqttPort: 9883,
            username: 'u',
            password: 'p',
            deviceId: 'd',
            modeId: '20030',
            httpPort: 7125,
            settings: {},
        } as unknown as BridgePrinterConfig;
        const b = new PrinterBridge(config, {} as GcodeService, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
        const warnings: string[] = [];
        const events: string[] = [];
        const internals = b as unknown as {
            onReport: (suffix: string, payload: Record<string, unknown>) => void;
            log: { warn: (m: string) => void; log: (m: string) => void };
        };
        internals.log.warn = (m: string) => {
            warnings.push(m);
        };
        internals.log.log = () => undefined;
        b.on('event', (e: { type: string }) => events.push(e.type));
        const report = (status: number, remain = 0) =>
            internals.onReport('multiColorBox/report', {
                action: 'getInfo',
                data: {
                    multi_color_box: [
                        { id: 0, slots: [], drying_status: { status, target_temp: 45, remain_time: remain } },
                    ],
                },
            });
        return { b, warnings, events, report };
    }

    it('logs a drying fault once and never calls it a finished drying', () => {
        const h = bridge();
        h.report(2);
        h.report(2);
        h.report(0);
        expect(h.warnings.filter((w) => w.includes('drying fault'))).toEqual(['The ACE reports a drying fault']);
        expect(h.events).not.toContain('drying_done');
    });

    it('still says when a drying finished', () => {
        const h = bridge();
        h.report(1, 1);
        h.report(0);
        expect(h.events).toContain('drying_done');
    });
});
