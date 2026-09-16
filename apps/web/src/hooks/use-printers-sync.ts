import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { printersQuery } from '@/lib/queries';
import { printersStore } from '@/stores/printers';

export function usePrintersSync() {
    const printers = useQuery(printersQuery);
    const setPrinters = printersStore.actions.setPrinters;
    useEffect(() => {
        if (printers.data) setPrinters(printers.data);
    }, [printers.data, setPrinters]);
    return printers;
}
