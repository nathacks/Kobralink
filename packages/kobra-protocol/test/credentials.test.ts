import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createCipheriv } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CTRL_LIMIT_REACHED, fetchPrinterCredentials } from '../src/credentials';
import { KobraProtocolError } from '../src/errors';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const IV = '0123456789abcdef';
const BUNDLE = {
    ip: '192.0.2.10',
    username: 'user-fixture',
    password: 'pass-fixture',
    deviceId: 'device-fixture',
    modeId: '20028',
    modelName: 'Anycubic Kobra 4',
};

function encrypt(data: unknown): string {
    const cipher = createCipheriv('aes-128-cbc', Buffer.from(TOKEN.slice(16, 32)), Buffer.from(IV));
    return Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]).toString('base64');
}

let server: Server;
let port = 0;
let ctrlReply: unknown = {};

beforeAll(async () => {
    server = createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/info') res.end(JSON.stringify({ token: TOKEN }));
        else res.end(JSON.stringify(ctrlReply));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
});

afterAll(() => {
    server.close();
});

beforeEach(() => {
    ctrlReply = { code: 200, message: 'success', data: { info: encrypt(BUNDLE), token: IV } };
});

async function failure(): Promise<KobraProtocolError> {
    try {
        await fetchPrinterCredentials('127.0.0.1', port);
    } catch (e) {
        if (e instanceof KobraProtocolError) return e;
        throw e;
    }
    throw new Error('expected a refusal');
}

describe('fetchPrinterCredentials', () => {
    it('decrypts the /ctrl bundle', async () => {
        expect(await fetchPrinterCredentials('127.0.0.1', port)).toEqual({
            printerIp: '192.0.2.10',
            username: 'user-fixture',
            password: 'pass-fixture',
            deviceId: 'device-fixture',
            modeId: '20028',
            model: 'Anycubic Kobra 4',
        });
    });

    it('accepts a bundle without a code', async () => {
        ctrlReply = { data: { info: encrypt(BUNDLE), token: IV } };
        expect((await fetchPrinterCredentials('127.0.0.1', port)).deviceId).toBe('device-fixture');
    });

    it('reports the connection limit for code 19002', async () => {
        ctrlReply = { code: CTRL_LIMIT_REACHED, message: 'limit', data: null };
        const e = await failure();
        expect(e.code).toBe('ctrl_limit');
        expect(e.params).toEqual({ code: 19002 });
    });

    it('reports any other refusal code', async () => {
        ctrlReply = { code: 19001, message: 'error', data: null };
        const e = await failure();
        expect(e.code).toBe('ctrl_refused');
        expect(e.params).toEqual({ code: 19001 });
    });

    it('keeps the invalid answer error for a success without a bundle', async () => {
        ctrlReply = { code: 200, data: {} };
        expect((await failure()).code).toBe('ctrl_invalid');
    });
});
