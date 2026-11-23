import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { KobraProtocolError } from '../src/errors';
import { uploadAccepted, uploadGcode } from '../src/upload';

let server: Server;
let port = 0;
let reply = '';
let received = { path: '', length: 0 };

beforeAll(async () => {
    server = createServer((req, res) => {
        let length = 0;
        req.on('data', (c: Buffer) => {
            length += c.length;
        });
        req.on('end', () => {
            received = { path: req.url ?? '', length };
            res.setHeader('Content-Type', 'application/json');
            res.end(reply);
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
});

afterAll(() => {
    server.close();
});

const upload = (data = Buffer.from('G28\n')) =>
    uploadGcode('127.0.0.1', `http://127.0.0.1:${port}/gcode_upload?s=token123`, 'part.gcode', data, { port });

async function refusal(): Promise<KobraProtocolError> {
    try {
        await upload();
    } catch (e) {
        if (e instanceof KobraProtocolError) return e;
        throw e;
    }
    throw new Error('the upload was accepted');
}

describe('uploadGcode', () => {
    it('resolves with the printer answer when it accepts the file', async () => {
        reply = JSON.stringify({ code: 200, data: { gcode: 'part.gcode' }, message: 'success' });
        const result = await upload();
        expect(result).toEqual({ code: 200, data: { gcode: 'part.gcode' }, message: 'success' });
        expect(received.path).toBe('/gcode_upload?s=token123');
        expect(received.length).toBeGreaterThan(4);
    });

    it('rejects with the printer code when it refuses the file', async () => {
        reply = JSON.stringify({ code: 19010, message: 'no space' });
        const err = await refusal();
        expect(err.code).toBe('upload_refused');
        expect(err.params).toEqual({ code: 19010, msg: 'no space' });
    });

    it('rejects a refusal without a message', async () => {
        reply = JSON.stringify({ code: 19007 });
        const err = await refusal();
        expect(err.code).toBe('upload_refused');
        expect(err.params).toEqual({ code: 19007, msg: '' });
    });

    it('rejects an answer that is not JSON', async () => {
        reply = '<html>busy</html>';
        const err = await refusal();
        expect(err.code).toBe('upload_unexpected');
        expect(err.params.text).toBe('<html>busy</html>');
    });

    it('rejects JSON that is not an object', async () => {
        reply = 'null';
        const err = await refusal();
        expect(err.code).toBe('upload_unexpected');
    });

    it('refuses an upload URL without a session token', async () => {
        const err = await uploadGcode(
            '127.0.0.1',
            'http://127.0.0.1/gcode_upload',
            'part.gcode',
            Buffer.alloc(1),
        ).catch((e) => e);
        expect(err).toBeInstanceOf(KobraProtocolError);
        expect(err.code).toBe('upload_no_token');
    });
});

describe('uploadAccepted', () => {
    it('accepts the success codes and an answer without a code', () => {
        expect(uploadAccepted({ code: 200 })).toBe(true);
        expect(uploadAccepted({ code: 0 })).toBe(true);
        expect(uploadAccepted({ message: 'success' })).toBe(true);
    });

    it('refuses any other code', () => {
        for (const code of [19001, 19007, 19010, 19011, 500]) expect(uploadAccepted({ code })).toBe(false);
    });
});
