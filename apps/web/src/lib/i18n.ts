import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { m } from '@/paraglide/messages';
import {
    baseLocale,
    getLocale,
    isLocale,
    type Locale,
    locales,
    setLocale as paraglideSetLocale,
} from '@/paraglide/runtime';

export { baseLocale, getLocale, isLocale, type Locale, locales, m };

dayjs.locale(getLocale());

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setLocale(locale: Locale): void {
    if (locale === getLocale()) return;
    paraglideSetLocale(locale, { reload: false });
    dayjs.locale(locale);
    document.documentElement.lang = locale;
    for (const listener of listeners) listener();
}

export function useLocale(): Locale {
    return useSyncExternalStore(subscribe, getLocale, getLocale);
}

export const LOCALE_LABEL: Record<Locale, () => string> = {
    fr: m.locale_fr,
    en: m.locale_en,
};

export function intlLocale(): string {
    return getLocale() === 'fr' ? 'fr-FR' : 'en-US';
}

export function zodErrorMap(issue: z.core.$ZodRawIssue): string | undefined {
    switch (issue.code) {
        case 'too_small': {
            const min = Number(issue.minimum);
            if (issue.origin === 'string') return min <= 1 ? m.validation_required() : m.validation_min_chars({ min });
            return m.validation_min({ min });
        }
        case 'too_big': {
            const max = Number(issue.maximum);
            return issue.origin === 'string' ? m.validation_max_chars({ max }) : m.validation_max({ max });
        }
        case 'invalid_format':
            if (issue.format === 'email') return m.validation_email();
            if (issue.format === 'url') return m.validation_url();
            return m.validation_invalid();
        case 'custom':
            if (issue.params?.i18n === 'ip') return m.validation_ip();
            return m.validation_invalid();
        case 'invalid_type':
        case 'invalid_value':
        case 'invalid_union':
            return m.validation_invalid();
        default:
            return undefined;
    }
}

export function installI18n(): void {
    document.documentElement.lang = getLocale();
    z.config({ customError: zodErrorMap });
}
