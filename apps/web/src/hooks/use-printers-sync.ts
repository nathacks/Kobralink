import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { usePrinterEvents } from '@/hooks/use-printer-events';
import { printerQuery, printerStateQuery, printersQuery } from '@/lib/queries';
import { usePrintersStore } from '@/stores/printers';

export function usePrintersSync() {
    const printers = useQuery(printersQuery);
    const setPrinters = usePrintersStore((s) => s.setPrinters);
    useEffect(() => {
        if (printers.data) setPrinters(printers.data);
    }, [printers.data, setPrinters]);
    return printers;
}

export function usePrinterSync(printerId: string, { events = false } = {}) {
    const printer = useQuery(printerQuery(printerId));
    const state = useQuery({ ...printerStateQuery(printerId), enabled: events });
    const upsertPrinter = usePrintersStore((s) => s.upsertPrinter);
    const setLiveState = usePrintersStore((s) => s.setLiveState);
    usePrinterEvents(events ? printerId : undefined);
    useEffect(() => {
        if (printer.data) upsertPrinter(printer.data);
    }, [printer.data, upsertPrinter]);
    useEffect(() => {
        if (state.data) setLiveState(printerId, state.data);
    }, [printerId, state.data, setLiveState]);
    return printer;
}
