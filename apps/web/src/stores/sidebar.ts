import { createStore } from '@tanstack/react-store';

export const SIDEBAR_KEY = 'kobralink:sidebar-collapsed';

function read(): boolean {
    try {
        return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
        return false;
    }
}

function write(collapsed: boolean): void {
    try {
        if (collapsed) localStorage.setItem(SIDEBAR_KEY, '1');
        else localStorage.removeItem(SIDEBAR_KEY);
    } catch {}
}

export const sidebarStore = createStore({ collapsed: read() }, ({ setState }) => ({
    toggle: () =>
        setState((s) => {
            write(!s.collapsed);
            return { collapsed: !s.collapsed };
        }),
}));
