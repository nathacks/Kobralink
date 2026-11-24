import { useSelector } from '@tanstack/react-store';
import { pinnedPrinterStore } from '@/stores/pinned-printer';

export function usePinnedPrinter(): string | null {
    return useSelector(pinnedPrinterStore, (s) => s.id);
}
