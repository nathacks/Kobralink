import { describe, expect, it } from 'bun:test';
import { redactPrinterUrl } from '../src/redact';

describe('redactPrinterUrl', () => {
    it('masks the upload token', () => {
        expect(redactPrinterUrl('http://192.0.2.10:18910/gcode_upload?s=AbC123xyz')).toBe(
            'http://192.0.2.10:18910/gcode_upload?s=…',
        );
        expect(redactPrinterUrl('http://192.0.2.10:18910/gcode_upload?a=1&s=AbC123')).toBe(
            'http://192.0.2.10:18910/gcode_upload?a=1&s=…',
        );
    });

    it('masks the camera token', () => {
        expect(redactPrinterUrl('http://192.0.2.10:18088/live/0123456789abcdef')).toBe(
            'http://192.0.2.10:18088/live/…',
        );
    });

    it('keeps a URL without tokens as is', () => {
        expect(redactPrinterUrl('http://192.0.2.10:18088/flv')).toBe('http://192.0.2.10:18088/flv');
    });
});

describe('redactPrinterUrl in a longer message', () => {
    it('masks only the token', () => {
        expect(redactPrinterUrl('http://192.0.2.10:18088/live/abc123: Server returned 404 Not Found')).toBe(
            'http://192.0.2.10:18088/live/…: Server returned 404 Not Found',
        );
        expect(redactPrinterUrl('upload to http://192.0.2.10:18910/gcode_upload?s=AbC1 failed')).toBe(
            'upload to http://192.0.2.10:18910/gcode_upload?s=… failed',
        );
    });
});
