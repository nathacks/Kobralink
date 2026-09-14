import { baseLocale, isLocale, overwriteGetLocale } from '@kobralink/i18n';

export function installLocale(tag: string): void {
    const short = tag.toLowerCase().split('-')[0] ?? '';
    const locale = isLocale(short) ? short : baseLocale;
    overwriteGetLocale(() => locale);
}
