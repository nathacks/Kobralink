import { useSelector } from '@tanstack/react-store';
import { type ResolvedTheme, type ThemePreference, themeStore } from '@/stores/theme';

export function useThemePreference(): ThemePreference {
    return useSelector(themeStore, (s) => s.preference);
}

export function useResolvedTheme(): ResolvedTheme {
    return useSelector(themeStore, (s) => s.resolved);
}
