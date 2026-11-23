export type Rgb = [number, number, number];

export function rgbCss([r, g, b]: Rgb): string {
    return `rgb(${r}, ${g}, ${b})`;
}

export function rgbToHex([r, g, b]: Rgb): string {
    return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): Rgb {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function textOn([r, g, b]: Rgb): string {
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff';
}

export function parseColor(color: string): Rgb | null {
    if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
        const hex = color.length === 4 ? `#${[...color.slice(1)].map((c) => c + c).join('')}` : color;
        return hexToRgb(hex);
    }
    const match = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isDark(color: string): boolean {
    const rgb = parseColor(color);
    return rgb ? textOn(rgb) === '#fff' : false;
}
