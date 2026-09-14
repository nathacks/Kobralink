import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { KobraProtocolError } from './errors';

export interface UploadResult {
    code?: number;
    message?: string;
    [k: string]: unknown;
}

export function uploadGcode(
    host: string,
    uploadUrl: string,
    remoteFilename: string,
    data: Buffer,
    opts: { port?: number; connectTimeoutMs?: number; readTimeoutMs?: number } = {},
): Promise<UploadResult> {
    const tokenIdx = uploadUrl.indexOf('?s=');
    if (tokenIdx === -1) {
        return Promise.reject(
            new KobraProtocolError(
                'upload_no_token',
                { url: uploadUrl },
                `Upload URL without session token: ${uploadUrl}`,
            ),
        );
    }
    const token = uploadUrl.slice(tokenIdx + 3);
    const port = opts.port ?? 18910;

    const boundary = '------------------------a3a050b927d92a4c';
    const sep = Buffer.from(`--${boundary}\r\n`);
    const end = Buffer.from(`--${boundary}--\r\n`);
    const partFilename = Buffer.concat([
        sep,
        Buffer.from('Content-Disposition: form-data; name="filename"\r\n\r\n'),
        Buffer.from(remoteFilename, 'utf8'),
        Buffer.from('\r\n'),
    ]);
    const partGcode = Buffer.concat([
        sep,
        Buffer.from(
            `Content-Disposition: form-data; name="gcode"; filename="${remoteFilename}"\r\n` +
                'Content-Type: application/octet-stream\r\n\r\n',
        ),
        data,
        Buffer.from('\r\n'),
    ]);
    const body = Buffer.concat([partFilename, partGcode, end]);

    return new Promise<UploadResult>((resolve, reject) => {
        const req = httpRequest(
            {
                host,
                port,
                method: 'POST',
                path: `/gcode_upload?s=${token}`,
                headers: {
                    Host: `${host}:${port}`,
                    'User-Agent': 'AnycubicSlicerNext/1.3.9.4',
                    Accept: '*/*',
                    'X-BBL-Client-Name': 'AnycubicSlicerNext',
                    'X-BBL-Client-Type': 'slicer',
                    'X-BBL-Client-Version': '01.03.09.04',
                    'X-BBL-Device-ID': randomUUID(),
                    'X-BBL-Language': 'fr-FR',
                    'X-BBL-OS-Type': 'windows',
                    'X-BBL-OS-Version': '10.0.26200',
                    'X-File-Length': String(data.length),
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': String(body.length),
                    Connection: 'close',
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    try {
                        resolve(JSON.parse(text));
                    } catch {
                        const snippet = text.slice(0, 200);
                        reject(
                            new KobraProtocolError(
                                'upload_unexpected',
                                { text: snippet },
                                `Upload: unexpected response: ${snippet}`,
                            ),
                        );
                    }
                });
                res.on('error', reject);
            },
        );

        req.on('socket', (s) => s.setTimeout(opts.connectTimeoutMs ?? 30000));
        req.on('finish', () => req.socket?.setTimeout(opts.readTimeoutMs ?? 180000));
        req.on('timeout', () =>
            req.destroy(new KobraProtocolError('upload_timeout', {}, 'Timeout waiting for the printer')),
        );
        req.on('error', reject);
        req.end(body);
    });
}
