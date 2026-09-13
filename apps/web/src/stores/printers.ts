import type { PrinterLiveState } from '@kobralink/shared';
import { create } from 'zustand';
import type { PrinterWithLive } from '@/lib/api';

export interface PrintersState {
    printers: Record<string, PrinterWithLive>;
    order: string[];
    selectedId: string | null;
}

export interface PrintersActions {
    setPrinters: (printers: PrinterWithLive[]) => void;
    upsertPrinter: (printer: PrinterWithLive) => void;
    removePrinter: (id: string) => void;
    setLiveState: (id: string, live: PrinterLiveState) => void;
    select: (id: string | null) => void;
}

export type PrintersStore = PrintersState & PrintersActions;

export const usePrintersStore = create<PrintersStore>((set) => ({
    printers: {},
    order: [],
    selectedId: null,
    setPrinters: (list) =>
        set({
            printers: Object.fromEntries(list.map((p) => [p.id, p])),
            order: list.map((p) => p.id),
        }),
    upsertPrinter: (printer) =>
        set((s) => ({
            printers: { ...s.printers, [printer.id]: { ...s.printers[printer.id], ...printer } },
            order: s.order.includes(printer.id) ? s.order : [...s.order, printer.id],
        })),
    removePrinter: (id) =>
        set((s) => {
            const { [id]: _, ...rest } = s.printers;
            return {
                printers: rest,
                order: s.order.filter((x) => x !== id),
                selectedId: s.selectedId === id ? null : s.selectedId,
            };
        }),
    setLiveState: (id, live) =>
        set((s) => {
            const current = s.printers[id];
            if (!current) return s;
            return { printers: { ...s.printers, [id]: { ...current, live } } };
        }),
    select: (id) => set({ selectedId: id }),
}));

export const usePrinters = () => usePrintersStore((s) => s.order.map((id) => s.printers[id]).filter(Boolean));
export const usePrinter = (id: string | null | undefined) => usePrintersStore((s) => (id ? s.printers[id] : undefined));
export const useSelectedPrinter = () => usePrintersStore((s) => (s.selectedId ? s.printers[s.selectedId] : undefined));
