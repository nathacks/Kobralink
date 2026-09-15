import { useStore } from '@tanstack/react-store';
import { pinnedPrinterStore } from '@/stores/pinned-printer';

export function usePinnedPrinter(): string | null {
    return useStore(pinnedPrinterStore, (s) => s.id);
}
