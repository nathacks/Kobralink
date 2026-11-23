import type { PrinterLiveState } from '@kobralink/shared';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrintClock } from './use-print-clock';

const state = (overrides: Partial<PrinterLiveState>) =>
    ({
        printState: 'printing',
        kobraState: 'printing',
        printDurationSec: 600,
        remainTimeSec: 1200,
        printTimeAt: Date.now() - 30_000,
        ...overrides,
    }) as PrinterLiveState;

afterEach(() => {
    vi.useRealTimers();
});

describe('usePrintClock', () => {
    it('extrapolates the printer time between two reports, by at most a minute', () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        vi.setSystemTime(new Date('2026-10-30T10:00:00Z'));
        const { result } = renderHook(() => usePrintClock(state({ printTimeAt: Date.now() - 30_000 })));
        expect(result.current).toEqual({ elapsedSec: 630, remainSec: 1170 });
        const { result: late } = renderHook(() => usePrintClock(state({ printTimeAt: Date.now() - 300_000 })));
        expect(late.current.elapsedSec).toBe(659);
    });

    it('does not run while the printer calibrates', () => {
        const { result } = renderHook(() =>
            usePrintClock(state({ kobraState: 'vibrating', printDurationSec: 0, remainTimeSec: 7080 })),
        );
        expect(result.current).toEqual({ elapsedSec: 0, remainSec: 7080 });
    });

    it('does not run outside a print', () => {
        const { result } = renderHook(() => usePrintClock(state({ printState: 'paused' })));
        expect(result.current.elapsedSec).toBe(600);
    });
});
