import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import duration from 'dayjs/plugin/duration';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { intlLocale, m } from '@/lib/i18n';

dayjs.extend(duration);
dayjs.extend(localizedFormat);

export function formatDuration(sec: number, options: { zero?: boolean } = {}): string {
    if (!Number.isFinite(sec) || sec < 0 || (!sec && !options.zero)) return '—';
    const d = dayjs.duration(Math.round(sec), 'seconds');
    const units: [number, (a: { n: string | number }) => string][] = [
        [Math.floor(d.asDays()), m.duration_days],
        [d.hours(), m.duration_hours],
        [d.minutes(), m.duration_minutes],
        [d.seconds(), m.duration_seconds],
    ];
    const first = units.findIndex(([n]) => n > 0);
    const shown = first < 0 ? units.slice(-1) : units.slice(first, first + 3);
    return shown.map(([n, msg], i) => msg({ n: i ? String(n).padStart(2, '0') : n })).join(' ');
}

export function formatMinutes(min: number): string {
    return formatDuration(min * 60, { zero: true });
}

export function formatBytes(n: number): string {
    if (n < 1024) return m.bytes_b({ n });
    if (n < 1024 * 1024) return m.bytes_kb({ n: (n / 1024).toFixed(1) });
    return m.bytes_mb({ n: (n / (1024 * 1024)).toFixed(1) });
}

export function formatDate(value: string | number | Date): string {
    return dayjs(value).format('L LT');
}

export function formatShortDate(value: string | number | Date): string {
    return dayjs(value).format('L');
}

export function formatTime(value: string | number | Date): string {
    return dayjs(value).format('LTS');
}

export function greeting(now = new Date()): string {
    const h = now.getHours();
    if (h < 6) return m.greeting_night();
    if (h < 18) return m.greeting_day();
    return m.greeting_evening();
}

export function formatMoney(value: number, currency: string): string {
    try {
        return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency }).format(value);
    } catch {
        return `${value.toFixed(2)} ${currency}`;
    }
}
