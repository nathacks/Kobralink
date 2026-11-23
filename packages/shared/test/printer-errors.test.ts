import { describe, expect, it } from 'bun:test';
import { PRINTER_ERROR_CODES, PRINTER_ERROR_MESSAGES, printerErrorMessageId } from '../src/printer-errors';

describe('printerErrorMessageId', () => {
    it('maps the common pause and failure codes to a message', () => {
        expect(printerErrorMessageId(10402)).toBe('printer_error_out_of_filament');
        expect(printerErrorMessageId(11842)).toBe('printer_error_tangle_or_clog');
        expect(printerErrorMessageId(10133)).toBe('printer_error_gcode_commands');
        expect(printerErrorMessageId(11801)).toBe('printer_error_spaghetti');
    });

    it('accepts the code as a string, as some reports carry it', () => {
        expect(printerErrorMessageId('10106')).toBe('printer_error_disk_full');
    });

    it('shares one message between codes that mean the same thing', () => {
        expect(printerErrorMessageId(10110)).toBe(printerErrorMessageId(10113));
        expect(printerErrorMessageId(10118)).toBe(printerErrorMessageId(10238));
        expect(printerErrorMessageId(10120)).toBe('printer_error_home_z');
        expect(printerErrorMessageId(10244)).toBe('printer_error_range_z');
    });

    it('returns nothing for an unknown, missing or malformed code', () => {
        expect(printerErrorMessageId(12345)).toBeNull();
        expect(printerErrorMessageId(0)).toBeNull();
        expect(printerErrorMessageId(null)).toBeNull();
        expect(printerErrorMessageId(undefined)).toBeNull();
        expect(printerErrorMessageId('?')).toBeNull();
        expect(printerErrorMessageId(10402.5)).toBeNull();
    });

    it('lists every mapped code', () => {
        expect(PRINTER_ERROR_CODES).toHaveLength(Object.keys(PRINTER_ERROR_MESSAGES).length);
        for (const code of PRINTER_ERROR_CODES) expect(printerErrorMessageId(code)).toMatch(/^printer_error_/);
    });
});
