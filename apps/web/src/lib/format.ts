import { intlLocale, m } from '@/lib/i18n';

export function formatDuration(sec: number): string {
    if (!sec || sec < 0) return '—';
    const h = Math.floor(sec / 3600);
    const min = Math.floor((sec % 3600) / 60);
    if (h) return `${h} h ${min.toString().padStart(2, '0')} min`;
    if (min) return `${min} min`;
    return `${Math.round(sec)} s`;
}

export function formatBytes(n: number): string {
    if (n < 1024) return m.bytes_b({ n });
    if (n < 1024 * 1024) return m.bytes_kb({ n: (n / 1024).toFixed(1) });
    return m.bytes_mb({ n: (n / (1024 * 1024)).toFixed(1) });
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' });
}

export function formatShortDate(ts: number | string): string {
    return new Date(ts).toLocaleDateString(intlLocale());
}

export function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(intlLocale());
}

export function formatMinutes(min: number): string {
    const h = Math.floor(min / 60);
    const rest = min % 60;
    return h ? `${h} h ${rest.toString().padStart(2, '0')}` : `${rest} min`;
}

export function greeting(now = new Date()): string {
    const h = now.getHours();
    if (h < 6) return m.greeting_night();
    if (h < 18) return m.greeting_day();
    return m.greeting_evening();
}
