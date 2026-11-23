import { describe, expect, it } from 'bun:test';
import { deletePrinterFilesSchema, printerFilePath, printPrinterFileSchema, splitPrinterFilePath } from '../src/files';

describe('printerFilePath', () => {
    it('keeps a root file name as is', () => {
        expect(printerFilePath({ filename: 'part.gcode', folder: null })).toBe('part.gcode');
    });

    it('prefixes a test model with its folder', () => {
        expect(printerFilePath({ filename: 'Shark.gcode', folder: 'test_model' })).toBe('test_model/Shark.gcode');
    });
});

describe('splitPrinterFilePath', () => {
    it('reads a root file', () => {
        expect(splitPrinterFilePath('part.gcode')).toEqual({ folder: null, filename: 'part.gcode' });
        expect(splitPrinterFilePath('/part.gcode')).toEqual({ folder: null, filename: 'part.gcode' });
    });

    it('reads a test model', () => {
        expect(splitPrinterFilePath('test_model/Shark.gcode')).toEqual({
            folder: 'test_model',
            filename: 'Shark.gcode',
        });
        expect(splitPrinterFilePath('/test_model/Shark.gcode')).toEqual({
            folder: 'test_model',
            filename: 'Shark.gcode',
        });
    });

    it('refuses any other folder, a deeper path or an empty name', () => {
        expect(splitPrinterFilePath('other/part.gcode')).toBeNull();
        expect(splitPrinterFilePath('test_model/a/part.gcode')).toBeNull();
        expect(splitPrinterFilePath('../part.gcode')).toBeNull();
        expect(splitPrinterFilePath('test_model/')).toBeNull();
        expect(splitPrinterFilePath('/')).toBeNull();
    });
});

describe('printer file schemas', () => {
    it('print a root file or a test model', () => {
        expect(printPrinterFileSchema.safeParse({ filename: 'part.gcode' }).success).toBe(true);
        expect(printPrinterFileSchema.safeParse({ filename: 'test_model/Shark.gcode' }).success).toBe(true);
    });

    it('refuse to print a path outside them', () => {
        expect(printPrinterFileSchema.safeParse({ filename: 'other/part.gcode' }).success).toBe(false);
        expect(printPrinterFileSchema.safeParse({ filename: '../part.gcode' }).success).toBe(false);
    });

    it('delete root files only', () => {
        expect(deletePrinterFilesSchema.safeParse({ filenames: ['part.gcode'] }).success).toBe(true);
        expect(deletePrinterFilesSchema.safeParse({ filenames: ['test_model/Shark.gcode'] }).success).toBe(false);
    });
});
