import { describe, expect, it } from 'bun:test';
import { estimateRatio, idleAfterSec, isFailure, mtbfSec, utilization } from '../src/stats/stats-metrics';

const t0 = new Date('2026-10-01T00:00:00.000Z').getTime();
const minutes = (n: number) => new Date(t0 + n * 60_000);

function job(over: Partial<Parameters<typeof idleAfterSec>[0][number]> = {}) {
    return {
        status: 'completed',
        failureReason: '',
        durationSec: 3600,
        estimatedSec: 0,
        startedAt: minutes(0),
        finishedAt: minutes(60),
        ...over,
    };
}

describe('isFailure', () => {
    it('counts errors and cancels, but not a cancel on purpose', () => {
        expect(isFailure({ status: 'error', failureReason: '' })).toBe(true);
        expect(isFailure({ status: 'cancelled', failureReason: '' })).toBe(true);
        expect(isFailure({ status: 'cancelled', failureReason: 'spaghetti' })).toBe(true);
        expect(isFailure({ status: 'cancelled', failureReason: 'user_cancel' })).toBe(false);
        expect(isFailure({ status: 'completed', failureReason: '' })).toBe(false);
    });
});

describe('utilization', () => {
    it('divides the print time by the time of every printer in the window', () => {
        expect(utilization(3600, 7200)).toBe(0.5);
        expect(utilization(3600, 7200, 2)).toBe(0.25);
        expect(utilization(9000, 3600)).toBe(1);
    });

    it('has no value without a window', () => {
        expect(utilization(100, 0)).toBeNull();
        expect(utilization(100, 10, 0)).toBeNull();
    });
});

describe('mtbfSec', () => {
    it('divides the print time by the failures, ignoring the running print', () => {
        const jobs = [
            job({ durationSec: 7200 }),
            job({ status: 'cancelled', durationSec: 600 }),
            job({ status: 'error', durationSec: 1200 }),
            job({ status: 'cancelled', failureReason: 'user_cancel', durationSec: 1000 }),
            job({ status: 'printing', durationSec: 5000, finishedAt: null }),
        ];
        expect(mtbfSec(jobs)).toBe(5000);
    });

    it('has no value without failures', () => {
        expect(mtbfSec([job()])).toBeNull();
        expect(mtbfSec([])).toBeNull();
    });
});

describe('idleAfterSec', () => {
    it('takes the median wait between the end of a print and the next start', () => {
        const jobs = [
            job({ startedAt: minutes(300), finishedAt: minutes(330) }),
            job({ startedAt: minutes(0), finishedAt: minutes(60) }),
            job({ startedAt: minutes(70), finishedAt: minutes(100) }),
            job({ startedAt: minutes(130), finishedAt: minutes(200) }),
        ];
        expect(idleAfterSec(jobs)).toBe(30 * 60);
    });

    it('averages the two middle waits and skips open or overlapping jobs', () => {
        const jobs = [
            job({ startedAt: minutes(0), finishedAt: minutes(10) }),
            job({ startedAt: minutes(20), finishedAt: minutes(30) }),
            job({ startedAt: minutes(50), finishedAt: null, status: 'printing' }),
            job({ startedAt: minutes(55), finishedAt: minutes(60) }),
        ];
        expect(idleAfterSec(jobs)).toBe(15 * 60);
        expect(idleAfterSec([job()])).toBeNull();
    });
});

describe('estimateRatio', () => {
    it('compares the real time of completed prints with their estimate', () => {
        const jobs = [
            job({ estimatedSec: 3000, durationSec: 3600 }),
            job({ estimatedSec: 1000, durationSec: 1200 }),
            job({ estimatedSec: 1000, durationSec: 0 }),
            job({ status: 'cancelled', estimatedSec: 5000, durationSec: 100 }),
        ];
        expect(estimateRatio(jobs)).toBe(1.2);
        expect(estimateRatio([job()])).toBeNull();
    });
});
