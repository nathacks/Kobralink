import type { PrinterLiveState } from '@kobralink/shared';
import { shallow, useSelector } from '@tanstack/react-store';
import { useEffect } from 'react';
import { EMPTY_SAMPLES, printersStore } from '@/stores/printers';

export const usePrinters = () =>
    useSelector(printersStore, (s) => s.order.map((id) => s.printers[id]).filter(Boolean), { compare: shallow });

export const usePrinter = (id: string | null | undefined) =>
    useSelector(printersStore, (s) => (id ? s.printers[id] : undefined));

export const useLiveState = (id: string): PrinterLiveState => {
    const live = useSelector(printersStore, (s) => s.printers[id]?.live);
    if (!live) throw new Error(`No live state for printer ${id}`);
    return live;
};

export const useSamples = (id: string) => {
    useEffect(() => printersStore.actions.loadSamples(id), [id]);
    return useSelector(printersStore, (s) => s.samples[id] ?? EMPTY_SAMPLES);
};

export const useSamplesReady = (id: string) => useSelector(printersStore, (s) => s.seeded[id]);
