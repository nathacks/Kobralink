import { describe, expect, it } from 'bun:test';
import { redactCapture } from '../dev/probe-printer';

describe('probe-printer capture', () => {
    it('masks credentials, identifiers and signed URLs', () => {
        const out = JSON.stringify(
            redactCapture(
                {
                    data: {
                        token: 'abcdef123456',
                        printerName: 'Kobra of dev-1234-xyz',
                        urls: { fileUploadurl: 'http://10.0.0.5:18910/gcode_upload?s=secret' },
                        mac: 'aa:bb',
                    },
                    temp: { curr_nozzle_temp: 210 },
                },
                ['dev-1234-xyz', '10.0.0.5', 'pw'],
            ),
        );
        for (const leak of ['abcdef123456', 'dev-1234-xyz', '10.0.0.5', 'secret', 'aa:bb']) {
            expect(out).not.toContain(leak);
        }
        expect(out).toContain('"curr_nozzle_temp":210');
    });
});
