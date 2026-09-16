import { type Locale, locales } from './paraglide/runtime.js';

export function resolveLocale(tag: string | null | undefined): Locale | undefined {
    if (!tag) return undefined;
    const full = tag.trim().toLowerCase();
    const base = full.split('-')[0] ?? '';
    return locales.find((l) => l === full) ?? locales.find((l) => l === base);
}
