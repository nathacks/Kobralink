import { AsyncLocalStorage } from 'node:async_hooks';
import { baseLocale, isLocale, type Locale, m, overwriteGetLocale } from '@kobralink/i18n';
import { KobraProtocolError } from '@kobralink/kobra-protocol';
import type { ConnectionError } from '@kobralink/shared';
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

const store = new AsyncLocalStorage<Locale>();

export { m };

export function localeFromHeader(header: string | string[] | null | undefined): Locale {
    const value = Array.isArray(header) ? header.join(',') : (header ?? '');
    for (const part of value.split(',')) {
        const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0] ?? '';
        if (isLocale(tag)) return tag;
    }
    return baseLocale;
}

export function runWithLocale<T>(locale: Locale, fn: () => T): T {
    return store.run(locale, fn);
}

export function installI18n(): void {
    overwriteGetLocale(() => store.getStore() ?? baseLocale);
}

export function localeMiddleware(req: Request, _res: Response, next: NextFunction): void {
    runWithLocale(localeFromHeader(req.headers['accept-language']), next);
}

export function connectionErrorMessage(error: ConnectionError | null | undefined): string {
    if (!error) return m.common_printer_offline();
    switch (error.code) {
        case 'mqtt_auth':
            return m.connection_mqtt_auth();
        case 'mqtt_refused':
            return m.connection_mqtt_refused();
        case 'unreachable':
            return m.connection_unreachable();
        case 'unreachable_ip':
            return m.connection_unreachable_ip({ ip: error.ip ?? '' });
        case 'lost':
            return m.connection_lost({ ip: error.ip ?? '' });
        case 'reconnecting':
            return m.connection_reconnecting();
        case 'manual':
            return m.connection_manual();
        default:
            return error.detail ?? m.common_printer_offline();
    }
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

export function protocolErrorMessage(e: unknown): string {
    if (!(e instanceof KobraProtocolError)) return e instanceof Error ? e.message : String(e);
    const p = e.params;
    switch (e.code) {
        case 'http_status':
            return m.api_credentials_http({ status: p.status ?? '?', url: p.url ?? '' });
        case 'info_invalid':
            return m.api_credentials_invalid_info();
        case 'ctrl_invalid':
            return m.api_credentials_invalid_ctrl();
        case 'upload_no_token':
            return m.api_upload_no_token({ url: p.url ?? '' });
        case 'upload_unexpected':
            return m.api_upload_unexpected({ text: p.text ?? '' });
        case 'upload_timeout':
            return m.api_upload_timeout();
        case 'mqtt_closed_handshake':
            return m.api_mqtt_closed_handshake();
        default:
            return e.message;
    }
}
