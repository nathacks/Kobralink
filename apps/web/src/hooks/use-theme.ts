import { useStore } from '@tanstack/react-store';
import { type ResolvedTheme, type ThemePreference, themeStore } from '@/stores/theme';

export function useThemePreference(): ThemePreference {
    return useStore(themeStore, (s) => s.preference);
}

export function useResolvedTheme(): ResolvedTheme {
    return useStore(themeStore, (s) => s.resolved);
}
