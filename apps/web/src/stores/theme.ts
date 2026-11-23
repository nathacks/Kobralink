import { createStore } from '@tanstack/react-store';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'kobralink:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
    return THEME_PREFERENCES.includes(value as ThemePreference);
}

function readPreference(): ThemePreference {
    try {
        const value = localStorage.getItem(THEME_KEY);
        return isPreference(value) ? value : 'dark';
    } catch {
        return 'dark';
    }
}

function writePreference(preference: ThemePreference): void {
    try {
        localStorage.setItem(THEME_KEY, preference);
    } catch {}
}

function systemPrefersDark(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
    if (preference === 'system') return systemDark ? 'dark' : 'light';
    return preference;
}

function applyTheme(theme: ResolvedTheme): void {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
}

const initial = readPreference();

export const themeStore = createStore(
    { preference: initial, resolved: resolveTheme(initial, systemPrefersDark()) },
    ({ setState }) => ({
        setPreference: (preference: ThemePreference) => {
            writePreference(preference);
            const resolved = resolveTheme(preference, systemPrefersDark());
            applyTheme(resolved);
            setState(() => ({ preference, resolved }));
        },
        syncSystem: () => {
            setState((s) => {
                const resolved = resolveTheme(s.preference, systemPrefersDark());
                applyTheme(resolved);
                return { ...s, resolved };
            });
        },
    }),
);

export function installTheme(): void {
    applyTheme(themeStore.state.resolved);
    if (typeof window.matchMedia !== 'function') return;
    window.matchMedia(DARK_QUERY).addEventListener('change', () => themeStore.actions.syncSystem());
}
