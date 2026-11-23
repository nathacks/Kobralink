import { describe, expect, it } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { countByStatus, homeStatus, nextToFinish } from './printer-status';

type P = Pick<PrinterWithLive, 'name' | 'live'>;

function printer(name: string, live: Partial<NonNullable<PrinterWithLive['live']>> | null): P {
    return { name, live: live === null ? null : ({ connected: true, printState: 'standby', ...live } as P['live']) };
}

describe('homeStatus', () => {
    it('maps the live state to one home status', () => {
        expect(homeStatus(printer('a', null))).toBe('offline');
        expect(homeStatus(printer('a', { connected: false, printState: 'printing' }))).toBe('offline');
        expect(homeStatus(printer('a', { printState: 'printing' }))).toBe('printing');
        expect(homeStatus(printer('a', { printState: 'paused' }))).toBe('paused');
        expect(homeStatus(printer('a', { printState: 'error' }))).toBe('error');
        expect(homeStatus(printer('a', { printState: 'standby' }))).toBe('ready');
        expect(homeStatus(printer('a', { printState: 'complete' }))).toBe('ready');
        expect(homeStatus({ ...printer('a', { printState: 'standby' }), awaitingBedClear: true })).toBe('bed_clear');
        expect(
            homeStatus({ ...printer('a', { printState: 'standby' }), maintenance: true, awaitingBedClear: true }),
        ).toBe('maintenance');
        expect(homeStatus({ ...printer('a', { printState: 'printing' }), maintenance: true })).toBe('printing');
    });
});

describe('countByStatus', () => {
    it('counts every status, including the empty ones', () => {
        const counts = countByStatus([
            printer('a', { printState: 'printing' }),
            printer('b', { printState: 'printing' }),
            printer('c', null),
        ]);
        expect(counts).toEqual({
            printing: 2,
            paused: 0,
            bed_clear: 0,
            ready: 0,
            error: 0,
            maintenance: 0,
            offline: 1,
        });
    });
});

describe('nextToFinish', () => {
    const now = 1_000_000;

    it('picks the printing printer that ends first', () => {
        const next = nextToFinish(
            [
                printer('slow', { printState: 'printing', remainTimeSec: 3600 }),
                printer('fast', { printState: 'printing', remainTimeSec: 60 }),
                printer('idle', { printState: 'standby', remainTimeSec: 10 }),
            ],
            now,
        );
        expect(next).toEqual({ name: 'fast', at: now + 60_000 });
    });

    it('ignores prints without a remaining time', () => {
        expect(nextToFinish([printer('a', { printState: 'printing', remainTimeSec: 0 })], now)).toBeNull();
        expect(nextToFinish([], now)).toBeNull();
    });
});
