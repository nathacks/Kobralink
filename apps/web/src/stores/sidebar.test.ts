import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadStore() {
    vi.resetModules();
    return import('./sidebar');
}

beforeEach(() => {
    localStorage.clear();
});

describe('sidebarStore', () => {
    it('starts expanded', async () => {
        expect((await loadStore()).sidebarStore.state.collapsed).toBe(false);
    });

    it('remembers the collapsed state', async () => {
        const { sidebarStore } = await loadStore();
        sidebarStore.actions.toggle();
        expect(sidebarStore.state.collapsed).toBe(true);
        expect(localStorage.getItem('kobralink:sidebar-collapsed')).toBe('1');
        expect((await loadStore()).sidebarStore.state.collapsed).toBe(true);
    });

    it('forgets the state when expanded again', async () => {
        localStorage.setItem('kobralink:sidebar-collapsed', '1');
        const { sidebarStore } = await loadStore();
        sidebarStore.actions.toggle();
        expect(sidebarStore.state.collapsed).toBe(false);
        expect(localStorage.getItem('kobralink:sidebar-collapsed')).toBeNull();
    });
});
