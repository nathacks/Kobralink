import { createStore } from '@tanstack/react-store';

const KEY = 'kobralink:pinned-printer';

function read(): string | null {
    try {
        return sessionStorage.getItem(KEY);
    } catch {
        return null;
    }
}

function write(id: string | null): void {
    try {
        if (id) sessionStorage.setItem(KEY, id);
        else sessionStorage.removeItem(KEY);
    } catch {}
}

export const pinnedPrinterStore = createStore({ id: read() }, ({ setState }) => ({
    pin: (id: string) => {
        write(id);
        setState(() => ({ id }));
    },
    unpin: () => {
        write(null);
        setState(() => ({ id: null }));
    },
}));
