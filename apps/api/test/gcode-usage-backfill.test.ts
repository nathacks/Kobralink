import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { GcodeService, META_VERSION } from '../src/gcode/gcode.service';
import { type TestDb, testDb } from './helpers/db';

let db: TestDb;
let svc: GcodeService;

const gcode = [
    '; filament_colour = #FF0000;#00FF00',
    '; filament_type = PLA;PETG',
    'T0',
    'G1 X1',
    '; filament used [mm] = 1500.5, 0',
    '; filament used [g] = 4.47, 0',
].join('\n');

const legacy = JSON.stringify([
    { slotIndex: 0, colorHex: '#FF0000', material: 'PLA', isUsed: true },
    { slotIndex: 1, colorHex: '#00FF00', material: 'PETG', isUsed: false },
]);

beforeAll(async () => {
    db = await testDb();
    svc = new GcodeService(db.prisma);
});

afterAll(() => db.close());

describe('backfillFilamentUsage', () => {
    it('reads the filament usage of files stored before it was parsed', async () => {
        await db.client.gcodeFile.create({
            data: { id: 'old1', filename: 'old.gcode', sizeBytes: gcode.length, md5: 'old1', filaments: legacy },
        });
        fs.writeFileSync(svc.filePath('old1', 'old.gcode'), gcode);
        expect(await svc.backfillFilamentUsage()).toBe(1);
        const file = await svc.get('old1');
        expect(file?.filaments.map((f) => [f.usedMm, f.usedG])).toEqual([
            [1500.5, 4.47],
            [0, 0],
        ]);
    });

    it('skips files already parsed, files without filaments and files missing on disk', async () => {
        await db.client.gcodeFile.create({
            data: { id: 'gone', filename: 'gone.gcode', sizeBytes: 1, md5: 'gone', filaments: legacy },
        });
        await db.client.gcodeFile.create({
            data: { id: 'none', filename: 'none.gcode', sizeBytes: 1, md5: 'none', filaments: '[]' },
        });
        expect(await svc.backfillFilamentUsage()).toBe(0);
    });

    it('stores the usage of new uploads right away', async () => {
        const file = await svc.save(null, 'new.gcode', Buffer.from(gcode));
        expect(file.filaments[0]).toMatchObject({ usedMm: 1500.5, usedG: 4.47 });
    });
});

describe('backfillTargets', () => {
    const sliced = [
        '; printer_model = ',
        '; printer_notes = ',
        '; nozzle_diameter = 0.4',
        '; printable_area = 0x0,260x0,260x260,0x260',
        'G1 X1',
    ].join('\n');

    it('reads the print target again for files stored by an older parser', async () => {
        await db.client.gcodeFile.create({
            data: {
                id: 'stale',
                filename: 'stale.gcode',
                sizeBytes: sliced.length,
                md5: 'stale',
                printerModel: '; printer_notes =',
                metaVersion: 1,
            },
        });
        fs.writeFileSync(svc.filePath('stale', 'stale.gcode'), sliced);
        expect(await svc.backfillTargets()).toBeGreaterThanOrEqual(1);
        const row = await db.client.gcodeFile.findUniqueOrThrow({ where: { id: 'stale' } });
        expect(row).toMatchObject({ printerModel: '', nozzleMm: 0.4, bedX: 260, metaVersion: META_VERSION });
        expect(await svc.backfillTargets()).toBe(0);
    });
});
