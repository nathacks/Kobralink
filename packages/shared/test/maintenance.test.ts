import { describe, expect, it } from 'bun:test';
import {
    MAINTENANCE_PRESET_KEYS,
    MAINTENANCE_PRESETS,
    maintenanceProgress,
    maintenanceTaskSchema,
} from '../src/maintenance';

describe('maintenanceProgress', () => {
    it('is due when any criterion is reached', () => {
        const task = { intervalHours: 100, intervalJobs: 20, intervalDays: 0 };
        expect(maintenanceProgress(task, { hours: 50, jobs: 5, days: 400 })).toEqual({ progress: 0.5, due: false });
        expect(maintenanceProgress(task, { hours: 10, jobs: 20, days: 0 })).toEqual({ progress: 1, due: true });
        expect(maintenanceProgress(task, { hours: 150, jobs: 0, days: 0 }).due).toBe(true);
    });

    it('ignores criteria set to zero and tasks without any', () => {
        expect(
            maintenanceProgress(
                { intervalHours: 0, intervalJobs: 0, intervalDays: 30 },
                { hours: 999, jobs: 999, days: 15 },
            ),
        ).toEqual({ progress: 0.5, due: false });
        expect(
            maintenanceProgress({ intervalHours: 0, intervalJobs: 0, intervalDays: 0 }, { hours: 1, jobs: 1, days: 1 }),
        ).toEqual({ progress: 0, due: false });
    });
});

describe('maintenanceTaskSchema', () => {
    it('requires a name and defaults the intervals to zero', () => {
        expect(maintenanceTaskSchema.safeParse({ name: '' }).success).toBe(false);
        expect(maintenanceTaskSchema.parse({ name: ' Clean nozzle ' })).toEqual({
            name: 'Clean nozzle',
            presetKey: '',
            note: '',
            intervalHours: 0,
            intervalJobs: 0,
            intervalDays: 0,
        });
    });
});

describe('maintenance preset keys', () => {
    it('accepts a known recommendation or none, and nothing else', () => {
        expect(maintenanceTaskSchema.parse({ name: 'x', presetKey: 'clean_bed' }).presetKey).toBe('clean_bed');
        expect(maintenanceTaskSchema.safeParse({ name: 'x', presetKey: 'polish' }).success).toBe(false);
    });

    it('covers every recommendation', () => {
        expect(MAINTENANCE_PRESETS.map((p) => p.key).sort()).toEqual([...MAINTENANCE_PRESET_KEYS].sort());
    });
});
