import { describe, expect, it } from 'bun:test';
import { KobraMqttClient } from '../src/mqtt-client';

function client() {
    const warnings: string[] = [];
    const c = new KobraMqttClient({
        host: '127.0.0.1',
        username: 'u',
        password: 'p',
        deviceId: 'd',
        modeId: '20028',
        logger: { debug: () => {}, info: () => {}, warn: (m: string) => warnings.push(m), error: () => {} },
    } as unknown as ConstructorParameters<typeof KobraMqttClient>[0]);
    const onClientError = (err: Error) => (c as unknown as { onClientError: (e: Error) => void }).onClientError(err);
    return { c, warnings, onClientError };
}

const reset = () => Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

describe('MQTT socket errors', () => {
    it('are logged and do not throw when nobody listens', () => {
        const h = client();
        expect(() => h.onClientError(reset())).not.toThrow();
        expect(h.warnings).toEqual(['MQTT error: read ECONNRESET']);
    });

    it('still reach a listener', () => {
        const h = client();
        const seen: string[] = [];
        h.c.on('error', (e) => seen.push(e.message));
        h.onClientError(reset());
        expect(seen).toEqual(['read ECONNRESET']);
    });
});
