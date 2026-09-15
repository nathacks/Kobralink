import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { usePrinterEvents } from '@/hooks/use-printer-events';
import { printerQuery, printerSamplesQuery, printerStateQuery, printersQuery } from '@/lib/queries';
import { printersStore } from '@/stores/printers';

export function usePrintersSync() {
    const printers = useQuery(printersQuery);
    const setPrinters = printersStore.actions.setPrinters;
    useEffect(() => {
        if (printers.data) setPrinters(printers.data);
    }, [printers.data, setPrinters]);
    return printers;
}

export function usePrinterSync(printerId: string, { events = false } = {}) {
    const printer = useQuery(printerQuery(printerId));
    const state = useQuery({ ...printerStateQuery(printerId), enabled: events });
    const samples = useQuery({ ...printerSamplesQuery(printerId), enabled: events });
    const upsertPrinter = printersStore.actions.upsertPrinter;
    const setLiveState = printersStore.actions.setLiveState;
    const seedSamples = printersStore.actions.seedSamples;
    usePrinterEvents(events ? printerId : undefined);
    useEffect(() => {
        if (printer.data) upsertPrinter(printer.data);
    }, [printer.data, upsertPrinter]);
    useEffect(() => {
        if (state.data) setLiveState(printerId, state.data);
    }, [printerId, state.data, setLiveState]);
    useEffect(() => {
        if (samples.data) seedSamples(printerId, samples.data);
    }, [printerId, samples.data, seedSamples]);
    return printer;
}
