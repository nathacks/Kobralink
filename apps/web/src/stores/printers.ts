import type { PrinterLiveState } from '@kobralink/shared';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { PrinterWithLive } from '@/lib/api';

export interface Sample {
    t: number;
    nozzle: number;
    bed: number;
    progress: number;
}

const MAX_SAMPLES = 60;
const EMPTY_SAMPLES: Sample[] = [];

export interface PrintersState {
    printers: Record<string, PrinterWithLive>;
    order: string[];
    selectedId: string | null;
    samples: Record<string, Sample[]>;
}

export interface PrintersActions {
    setPrinters: (printers: PrinterWithLive[]) => void;
    upsertPrinter: (printer: PrinterWithLive) => void;
    removePrinter: (id: string) => void;
    setLiveState: (id: string, live: PrinterLiveState) => void;
    patchLiveState: (id: string, patch: Partial<PrinterLiveState>) => void;
    select: (id: string | null) => void;
}

export type PrintersStore = PrintersState & PrintersActions;

export const usePrintersStore = create<PrintersStore>((set) => ({
    printers: {},
    order: [],
    selectedId: null,
    samples: {},
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
            const { [id]: __, ...samples } = s.samples;
            return {
                printers: rest,
                samples,
                order: s.order.filter((x) => x !== id),
                selectedId: s.selectedId === id ? null : s.selectedId,
            };
        }),
    setLiveState: (id, live) =>
        set((s) => {
            const current = s.printers[id];
            const printers = current ? { ...s.printers, [id]: { ...current, live } } : s.printers;
            const old = s.samples[id] ?? EMPTY_SAMPLES;
            const last = old[old.length - 1];
            if (last && live.updatedAt - last.t < 2000) return { printers };
            const next = [
                ...old,
                { t: live.updatedAt, nozzle: live.nozzleTemp, bed: live.bedTemp, progress: live.progress },
            ];
            return {
                printers,
                samples: {
                    ...s.samples,
                    [id]: next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next,
                },
            };
        }),
    patchLiveState: (id, patch) =>
        set((s) => {
            const current = s.printers[id];
            if (!current?.live) return s;
            return { printers: { ...s.printers, [id]: { ...current, live: { ...current.live, ...patch } } } };
        }),
    select: (id) => set({ selectedId: id }),
}));

export const usePrinters = () =>
    usePrintersStore(useShallow((s) => s.order.map((id) => s.printers[id]).filter(Boolean)));
export const usePrinter = (id: string | null | undefined) => usePrintersStore((s) => (id ? s.printers[id] : undefined));
export const useSelectedPrinter = () => usePrintersStore((s) => (s.selectedId ? s.printers[s.selectedId] : undefined));

export const useLiveState = (id: string): PrinterLiveState => {
    const live = usePrintersStore((s) => s.printers[id]?.live);
    if (!live) throw new Error(`Aucun état live pour l'imprimante ${id}`);
    return live;
};
export const useSamples = (id: string) => usePrintersStore((s) => s.samples[id] ?? EMPTY_SAMPLES);
