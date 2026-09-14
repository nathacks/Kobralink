import type { PrinterLiveState } from '@kobralink/shared';
import { createStore } from '@tanstack/react-store';
import type { PrinterWithLive } from '@/lib/api';

export interface Sample {
    t: number;
    nozzle: number;
    bed: number;
    progress: number;
}

const MAX_SAMPLES = 60;
export const EMPTY_SAMPLES: Sample[] = [];

export interface PrintersState {
    printers: Record<string, PrinterWithLive>;
    order: string[];
    samples: Record<string, Sample[]>;
}

const initialState: PrintersState = {
    printers: {},
    order: [],
    samples: {},
};

export const printersStore = createStore(initialState, ({ setState }) => ({
    setPrinters: (list: PrinterWithLive[]) =>
        setState((s) => ({
            ...s,
            printers: Object.fromEntries(list.map((p) => [p.id, p])),
            order: list.map((p) => p.id),
        })),
    upsertPrinter: (printer: PrinterWithLive) =>
        setState((s) => ({
            ...s,
            printers: { ...s.printers, [printer.id]: { ...s.printers[printer.id], ...printer } },
            order: s.order.includes(printer.id) ? s.order : [...s.order, printer.id],
        })),
    removePrinter: (id: string) =>
        setState((s) => {
            const { [id]: _, ...rest } = s.printers;
            const { [id]: __, ...samples } = s.samples;
            return {
                ...s,
                printers: rest,
                samples,
                order: s.order.filter((x) => x !== id),
            };
        }),
    setLiveState: (id: string, live: PrinterLiveState) =>
        setState((s) => {
            const current = s.printers[id];
            const printers = current ? { ...s.printers, [id]: { ...current, live } } : s.printers;
            const old = s.samples[id] ?? EMPTY_SAMPLES;
            const last = old[old.length - 1];
            if (last && live.updatedAt - last.t < 2000) return { ...s, printers };
            const next = [
                ...old,
                { t: live.updatedAt, nozzle: live.nozzleTemp, bed: live.bedTemp, progress: live.progress },
            ];
            return {
                ...s,
                printers,
                samples: {
                    ...s.samples,
                    [id]: next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next,
                },
            };
        }),
    patchLiveState: (id: string, patch: Partial<PrinterLiveState>) =>
        setState((s) => {
            const current = s.printers[id];
            if (!current?.live) return s;
            return { ...s, printers: { ...s.printers, [id]: { ...current, live: { ...current.live, ...patch } } } };
        }),
}));
