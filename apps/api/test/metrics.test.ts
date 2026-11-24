import { describe, expect, it } from 'bun:test';
import type { PrinterLiveState } from '@kobralink/shared';
import { renderMetrics } from '../src/metrics/metrics';

function state(overrides: Partial<PrinterLiveState> = {}): PrinterLiveState {
    return {
        printerId: 'p1',
        printerName: 'Kobra "X"',
        firmwareVersion: '1.2.3',
        connected: true,
        printState: 'printing',
        nozzleTemp: 220.5,
        nozzleTarget: 220,
        bedTemp: 60,
        bedTarget: 60,
        fanSpeed: 50,
        printSpeedMode: 2,
        progress: 0.42,
        printDurationSec: 600,
        remainTimeSec: 900,
        currLayer: 10,
        totalLayers: 100,
        errorCode: 0,
        lightOn: true,
        storageUsedMb: 1,
        storageTotalMb: 2,
        aceUnits: [
            {
                id: 0,
                autoFeed: true,
                drying: { status: 1, targetTemp: 50, duration: 60, remainTime: 30, humidity: 35, currentTemp: null },
            },
        ],
        ...overrides,
    } as PrinterLiveState;
}

describe('renderMetrics', () => {
    it('renders gauges in Prometheus text format with escaped labels', () => {
        const out = renderMetrics([state()]);
        expect(out).toContain('# TYPE kobralink_nozzle_temperature_celsius gauge');
        expect(out).toContain('kobralink_nozzle_temperature_celsius{printer_id="p1"} 220.5');
        expect(out).toContain('kobralink_printer_info{printer_id="p1",name="Kobra \\"X\\"",firmware="1.2.3"} 1');
        expect(out).toContain('kobralink_print_progress_ratio{printer_id="p1"} 0.42');
        expect(out).toContain('kobralink_fan_speed_ratio{printer_id="p1"} 0.5');
        expect(out).toContain('kobralink_storage_used_bytes{printer_id="p1"} 1048576');
        expect(out).toContain('kobralink_ace_humidity_percent{printer_id="p1",ace="0"} 35');
        expect(out).toContain('kobralink_ace_drying{printer_id="p1",ace="0"} 1');
        expect(out).not.toContain('kobralink_ace_temperature_celsius{');
        expect(out.endsWith('\n')).toBe(true);
    });

    it('zeroes job gauges when idle', () => {
        const out = renderMetrics([state({ printState: 'standby', progress: 1, remainTimeSec: 5 })]);
        expect(out).toContain('kobralink_print_progress_ratio{printer_id="p1"} 0');
        expect(out).toContain('kobralink_print_remaining_seconds{printer_id="p1"} 0');
        expect(out).toContain('kobralink_printer_state{printer_id="p1",state="standby"} 1');
    });
});
