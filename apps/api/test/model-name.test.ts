import { describe, expect, it } from 'bun:test';
import { type BridgePrinterConfig, PrinterBridge } from '../src/bridge/printer-bridge';
import type { GcodeService } from '../src/gcode/gcode.service';

function bridgeFor(model: string): PrinterBridge {
    const config = {
        id: 'printer-1',
        name: 'Workshop',
        ip: '127.0.0.1',
        mqttPort: 9883,
        username: 'u',
        password: 'p',
        deviceId: 'd',
        modeId: '20028',
        model,
        httpPort: 7125,
        settings: {},
    } as unknown as BridgePrinterConfig;
    return new PrinterBridge(config, {} as GcodeService, { cert: Buffer.alloc(0), key: Buffer.alloc(0) });
}

const info = (bridge: PrinterBridge, data: Record<string, unknown>) =>
    (bridge as unknown as { onReport: (suffix: string, payload: Record<string, unknown>) => void }).onReport(
        'info/report',
        { state: 'done', data },
    );

describe('modelName', () => {
    it('uses the stored model without the brand prefix', () => {
        expect(bridgeFor('Anycubic Kobra 4').modelName).toBe('Kobra 4');
    });

    it('prefers the model reported by the printer', () => {
        const bridge = bridgeFor('Anycubic Kobra X');
        info(bridge, { model: 'Anycubic Kobra 4', version: '1.2.1.3' });
        expect(bridge.modelName).toBe('Kobra 4');
    });

    it('falls back to a generic name', () => {
        expect(bridgeFor('').modelName).toBe('Kobra');
    });
});
