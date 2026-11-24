import type { PrinterLiveState } from '@kobralink/shared';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { printersStore } from '@/stores/printers';
import { useLiveState, usePrinterList, usePrinters } from './use-printers';

const { setPrinters, setLiveState, upsertPrinter } = printersStore.actions;

const live = (patch: Partial<PrinterLiveState> = {}) =>
    ({
        connected: true,
        nozzleTemp: 20,
        amsSlots: [{ globalIndex: 0, color: [1, 2, 3] }],
        updatedAt: 1,
        ...patch,
    }) as unknown as PrinterLiveState;
const printer = (id: string) => ({ id, name: id, live: live() }) as unknown as PrinterWithLive;

function counted<T>(hook: () => T) {
    let renders = 0;
    const { result } = renderHook(() => {
        renders++;
        return hook();
    });
    return { result, renders: () => renders };
}

beforeEach(() => setPrinters([printer('p1'), printer('p2')]));

describe('printer hooks', () => {
    it('only re-renders when the selected live fields change', () => {
        const h = counted(() => useLiveState('p1', ({ connected, amsSlots }) => ({ connected, amsSlots })));
        act(() => setLiveState('p1', live({ nozzleTemp: 21, updatedAt: 2 })));
        expect(h.renders()).toBe(1);
        act(() => setLiveState('p1', live({ connected: false, updatedAt: 3 })));
        expect(h.renders()).toBe(2);
        expect(h.result.current.connected).toBe(false);
    });

    it('re-renders when a nested slot really changes', () => {
        const h = counted(() => useLiveState('p1', (s) => s.amsSlots));
        act(() =>
            setLiveState('p1', live({ amsSlots: [{ globalIndex: 0, color: [9, 9, 9] }] as never, updatedAt: 2 })),
        );
        expect(h.renders()).toBe(2);
    });

    it('keeps the printer list still while live state moves, and updates it on a rename', () => {
        const h = counted(() => usePrinterList());
        act(() => setLiveState('p1', live({ nozzleTemp: 99, updatedAt: 2 })));
        expect(h.renders()).toBe(1);
        act(() => upsertPrinter({ ...printer('p1'), name: 'renamed' }));
        expect(h.result.current[0].name).toBe('renamed');
    });

    it('returns every printer with its live state without a selector', () => {
        const h = counted(() => usePrinters());
        act(() => setLiveState('p2', live({ nozzleTemp: 50, updatedAt: 2 })));
        expect(h.result.current.map((p) => p.live?.nozzleTemp)).toEqual([20, 50]);
    });
});
