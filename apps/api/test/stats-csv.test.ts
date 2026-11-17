import { describe, expect, it } from 'bun:test';
import type { PrintJobDto } from '@farolprint/shared';
import { jobsToCsv } from '../src/stats/stats-csv';

const base: PrintJobDto = {
    id: 'j1',
    printerId: 'p1',
    fileId: null,
    filename: 'part, "v2".gcode',
    status: 'cancelled',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: '2026-10-01T11:00:00.000Z',
    durationSec: 3600,
    estimatedSec: 3000,
    filamentMm: 1234.6,
    spoolUsage: [],
    thumbnail: null,
    errorCode: 12,
    errorMsg: 'Filament runout',
    failureReason: 'filament_runout',
    note: 'line1\nline2',
    hasSnapshot: true,
    pausedAt: null,
    cost: { filament: 0.5, energy: 0.1, total: 0.6 },
};

describe('jobsToCsv', () => {
    it('writes a header and one quoted row per job', () => {
        const csv = jobsToCsv([base], new Map([['p1', 'Kobra']]), 'EUR');
        const [header, row, tail] = csv.split('\r\n');
        expect(header.startsWith('started_at,finished_at,printer,file,status')).toBe(true);
        expect(row).toContain('"part, ""v2"".gcode"');
        expect(row).toContain(',Kobra,');
        expect(header.endsWith(',note,cost_filament,cost_energy,cost_total,currency')).toBe(true);
        expect(row).toContain(',filament_runout,12,Filament runout,"line1\nline2",0.5,0.1,0.6,EUR');
        expect(row).toContain(',1235,');
        expect(tail).toBe('');
    });

    it('leaves cost columns empty for unpriced jobs', () => {
        const csv = jobsToCsv([{ ...base, cost: null, errorCode: 0 }], new Map(), 'EUR');
        expect(csv.split('\r\n')[1]?.endsWith('"line1\nline2",,,,')).toBe(true);
    });
});
