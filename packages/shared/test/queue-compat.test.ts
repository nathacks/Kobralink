import { describe, expect, it } from 'bun:test';
import {
    addQueueItemSchema,
    bedClearSchema,
    blockingReasons,
    type FileTargetInfo,
    hexDistance,
    isTargeted,
    normalizeModel,
    type PrinterTargetInfo,
    SOFT_COMPAT_REASONS,
    staticReasons,
    stockReasons,
} from '../src/queue';

const kobra4: PrinterTargetInfo = {
    id: 'p1',
    model: 'Anycubic Kobra 4',
    tags: ['farm-a', 'petg'],
    nozzleMm: 0.4,
    buildVolumeMm: { x: 260, y: 260, z: 260 },
};

const file = (over: Partial<FileTargetInfo> = {}): FileTargetInfo => ({
    printerModel: 'Anycubic Kobra 4',
    nozzleMm: 0.4,
    bedX: 260,
    bedY: 260,
    extentX: 120,
    extentY: 90,
    maxZ: 40,
    ...over,
});

describe('normalizeModel', () => {
    it('ignores the brand, the case and the spacing', () => {
        expect(normalizeModel('Anycubic Kobra 4')).toBe(normalizeModel('KOBRA-4'));
        expect(normalizeModel('Kobra S1 Max')).not.toBe(normalizeModel('Kobra S1'));
    });
});

describe('isTargeted', () => {
    it('matches a printer, its tags, or any printer', () => {
        expect(isTargeted({ printerId: 'p1', targetTags: [] }, kobra4)).toBe(true);
        expect(isTargeted({ printerId: 'p2', targetTags: [] }, kobra4)).toBe(false);
        expect(isTargeted({ printerId: null, targetTags: ['petg'] }, kobra4)).toBe(true);
        expect(isTargeted({ printerId: null, targetTags: ['petg', 'abs'] }, kobra4)).toBe(false);
        expect(isTargeted({ printerId: null, targetTags: [] }, kobra4)).toBe(true);
    });
});

describe('staticReasons', () => {
    it('accepts a file sliced for the printer', () => {
        expect(staticReasons(file(), kobra4)).toEqual([]);
    });

    it('refuses another model, another nozzle and parts that do not fit', () => {
        expect(staticReasons(file({ printerModel: 'Anycubic Kobra S1' }), kobra4)).toEqual(['model']);
        expect(staticReasons(file({ nozzleMm: 0.6 }), kobra4)).toEqual(['nozzle']);
        expect(staticReasons(file({ printerModel: '', extentX: 300 }), kobra4)).toEqual(['size']);
        expect(staticReasons(file({ maxZ: 300 }), kobra4)).toEqual(['size']);
    });

    it('uses the sliced bed when the parts are unknown, and skips what is unknown', () => {
        expect(staticReasons(file({ printerModel: '', extentX: null, extentY: null, bedX: 420 }), kobra4)).toEqual([
            'size',
        ]);
        const unknown = file({
            printerModel: '',
            nozzleMm: null,
            bedX: null,
            bedY: null,
            extentX: null,
            extentY: null,
            maxZ: null,
        });
        expect(staticReasons(unknown, { ...kobra4, nozzleMm: null, buildVolumeMm: null })).toEqual([]);
    });
});

describe('stockReasons', () => {
    const black = { material: 'PETG', colorHex: '#111111' };

    it('needs a spool of the same material in a close colour', () => {
        expect(stockReasons([black], [{ material: 'PETG', colorHex: '#000000' }])).toEqual([]);
        expect(stockReasons([black], [{ material: 'PLA', colorHex: '#000000' }])).toEqual(['material']);
        expect(stockReasons([black], [{ material: 'PETG', colorHex: '#FFFFFF' }])).toEqual(['color']);
    });

    it('does not judge without any stock information', () => {
        expect(stockReasons([black], null)).toEqual([]);
        expect(stockReasons([black], [])).toEqual([]);
    });

    it('measures colours in RGB space', () => {
        expect(hexDistance('#000000', '#000000')).toBe(0);
        expect(Math.round(hexDistance('#000000', '#FFFFFF'))).toBe(442);
    });
});

describe('queue schemas', () => {
    it('targets a printer, tags, or any printer', () => {
        expect(addQueueItemSchema.parse({ fileId: 'f', targetTags: [' PETG '] }).targetTags).toEqual(['petg']);
        expect(addQueueItemSchema.parse({ fileId: 'f', printerId: null }).printerId).toBeNull();
    });

    it('rates the cleared bed as good by default', () => {
        expect(bedClearSchema.parse({})).toEqual({ outcome: 'good' });
        expect(bedClearSchema.safeParse({ outcome: 'meh' }).success).toBe(false);
    });
});

describe('blockingReasons', () => {
    it('keeps every reason except the colour, which is only a hint', () => {
        expect(blockingReasons(['model', 'color', 'size'])).toEqual(['model', 'size']);
        expect(blockingReasons(['color'])).toEqual([]);
        expect(SOFT_COMPAT_REASONS).toEqual(['color']);
    });
});
