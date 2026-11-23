import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

function mockSystem(dark: boolean) {
    const listeners = new Set<Listener>();
    const media = {
        get matches() {
            return dark;
        },
        addEventListener: (_: string, cb: Listener) => listeners.add(cb),
        removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    };
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => media),
    );
    return {
        change(next: boolean) {
            dark = next;
            for (const cb of listeners) cb();
        },
    };
}

async function loadStore() {
    vi.resetModules();
    return import('./theme');
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
    it('follows the device for the system preference', async () => {
        const { resolveTheme } = await loadStore();
        expect(resolveTheme('system', true)).toBe('dark');
        expect(resolveTheme('system', false)).toBe('light');
    });

    it('ignores the device for an explicit choice', async () => {
        const { resolveTheme } = await loadStore();
        expect(resolveTheme('light', true)).toBe('light');
        expect(resolveTheme('dark', false)).toBe('dark');
    });
});

describe('themeStore', () => {
    it('starts dark whatever the device theme', async () => {
        mockSystem(false);
        const { installTheme, themeStore } = await loadStore();
        installTheme();
        expect(themeStore.state).toEqual({ preference: 'dark', resolved: 'dark' });
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('reads a stored choice and ignores an invalid one', async () => {
        mockSystem(true);
        localStorage.setItem('kobralink:theme', 'light');
        expect((await loadStore()).themeStore.state).toEqual({ preference: 'light', resolved: 'light' });
        localStorage.setItem('kobralink:theme', 'sepia');
        expect((await loadStore()).themeStore.state.preference).toBe('dark');
    });

    it('stores every choice, system included', async () => {
        mockSystem(false);
        const { themeStore } = await loadStore();
        themeStore.actions.setPreference('dark');
        expect(localStorage.getItem('kobralink:theme')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        themeStore.actions.setPreference('system');
        expect(localStorage.getItem('kobralink:theme')).toBe('system');
        expect(themeStore.state.resolved).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('follows device changes only on the system preference', async () => {
        const system = mockSystem(false);
        const { installTheme, themeStore } = await loadStore();
        installTheme();
        themeStore.actions.setPreference('system');
        system.change(true);
        expect(themeStore.state.resolved).toBe('dark');
        themeStore.actions.setPreference('light');
        system.change(false);
        system.change(true);
        expect(themeStore.state.resolved).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('works when storage is unavailable', async () => {
        mockSystem(false);
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const { themeStore } = await loadStore();
        expect(themeStore.state.preference).toBe('dark');
        themeStore.actions.setPreference('light');
        expect(themeStore.state.resolved).toBe('light');
        getItem.mockRestore();
        setItem.mockRestore();
    });
});
