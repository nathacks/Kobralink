import { useEffect, useState } from 'react';

export type ThemeColors = { primary: string; muted: string; border: string };

function cssColor(name: string, fallback: string) {
    const el = document.createElement('div');
    el.style.color = `var(${name})`;
    el.style.position = 'absolute';
    el.style.opacity = '0';
    document.body.appendChild(el);
    const value = getComputedStyle(el).color;
    el.remove();
    return value || fallback;
}

function readColors(): ThemeColors {
    return {
        primary: cssColor('--primary', '#10b981'),
        muted: cssColor('--muted-foreground', '#888888'),
        border: cssColor('--border', '#444444'),
    };
}

export function useThemeColors() {
    const [colors, setColors] = useState(readColors);
    useEffect(() => {
        const observer = new MutationObserver(() => setColors(readColors()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        return () => observer.disconnect();
    }, []);
    return colors;
}
