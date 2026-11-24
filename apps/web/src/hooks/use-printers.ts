import type { Printer, PrinterLiveState } from '@kobralink/shared';
import { shallow, useSelector } from '@tanstack/react-store';
import { useEffect } from 'react';
import type { PrinterWithLive } from '@/lib/api';
import { EMPTY_SAMPLES, type PrintersState, printersStore } from '@/stores/printers';

const all = (s: PrintersState) => s.order.map((id) => s.printers[id]).filter(Boolean);

const sameIgnoringLive = (a: PrinterWithLive[], b: PrinterWithLive[]) =>
    a.length === b.length && a.every((p, i) => p === b[i] || shallow({ ...p, live: null }, { ...b[i], live: null }));

export const usePrinters = <T = PrinterWithLive[]>(
    select: (printers: PrinterWithLive[]) => T = (printers) => printers as T,
): T => useSelector(printersStore, (s) => select(all(s)), { compare: shallow });

export const usePrinterList = (): Printer[] => useSelector(printersStore, all, { compare: sameIgnoringLive });

export const usePrinter = <T = PrinterWithLive | undefined>(
    id: string | null | undefined,
    select: (printer: PrinterWithLive | undefined) => T = (printer) => printer as T,
): T => useSelector(printersStore, (s) => select(id ? s.printers[id] : undefined), { compare: shallow });

export const useLiveState = <T = PrinterLiveState>(
    id: string,
    select: (live: PrinterLiveState) => T = (live) => live as T,
): T =>
    useSelector(
        printersStore,
        (s) => {
            const live = s.printers[id]?.live;
            if (!live) throw new Error(`No live state for printer ${id}`);
            return select(live);
        },
        { compare: shallow },
    );

export const useSamples = (id: string) => {
    useEffect(() => printersStore.actions.loadSamples(id), [id]);
    return useSelector(printersStore, (s) => s.samples[id] ?? EMPTY_SAMPLES);
};

export const useSamplesReady = (id: string) => useSelector(printersStore, (s) => s.seeded[id]);
