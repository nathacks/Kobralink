import { describe, expect, it } from 'vitest';
import { api, withFullSettings } from './api';

describe('api url builders', () => {
    it('builds the CSV export link with the current filters', () => {
        expect(api.statsCsvUrl()).toBe('/api/v1/stats/export.csv?printerId=&days=0');
        expect(api.statsCsvUrl('p 1', 30)).toBe('/api/v1/stats/export.csv?printerId=p%201&days=30');
    });

    it('points at the failure snapshot of a job', () => {
        expect(api.files.snapshotUrl('p1', 'j1')).toBe('/api/v1/printers/p1/history/j1/snapshot');
    });
});

describe('withFullSettings', () => {
    it('fills the settings an older server did not send with their defaults', () => {
        const printer = withFullSettings({ id: 'p1', settings: { autoLeveling: false } as Record<string, unknown> });
        expect(printer.settings).toMatchObject({ autoLeveling: false, queueBedClearConfirm: true });
        expect(printer.settings.profile).toEqual(expect.objectContaining({ tags: [] }));
    });

    it('leaves settings it cannot read untouched', () => {
        const printer = { id: 'p1', settings: { pollIntervalSec: 'fast' } };
        expect(withFullSettings(printer)).toBe(printer);
    });
});
