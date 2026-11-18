import dayjs from 'dayjs';
import { CalendarClock, type LucideIcon, MoonStar, Sun, Sunrise, Sunset, Zap } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const DAYS = 14;
const MINUTE_STEP = 5;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

const PERIODS: { from: number; icon: LucideIcon; label: () => string }[] = [
    { from: 0, icon: MoonStar, label: () => m.schedule_period_night() },
    { from: 6, icon: Sunrise, label: () => m.schedule_period_morning() },
    { from: 12, icon: Sun, label: () => m.schedule_period_afternoon() },
    { from: 18, icon: Sunset, label: () => m.schedule_period_evening() },
];

const pad = (n: number) => String(n).padStart(2, '0');

function roundUp(date: dayjs.Dayjs): dayjs.Dayjs {
    const extra = (MINUTE_STEP - (date.minute() % MINUTE_STEP)) % MINUTE_STEP;
    return date.add(extra, 'minute').second(0).millisecond(0);
}

export function defaultStart(now: Date): Date {
    return dayjs(now).add(1, 'hour').startOf('hour').toDate();
}

function Chip({
    active,
    disabled,
    onClick,
    children,
    className,
    label,
}: {
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    label?: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'shrink-0 rounded-2xl px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35',
                active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-background/70 text-foreground hover:bg-accent hover:text-accent-foreground',
                className,
            )}
        >
            {children}
        </button>
    );
}

export function DateTimePicker({
    value,
    onChange,
    label,
    now = new Date(),
}: {
    value: Date;
    onChange: (next: Date) => void;
    label: string;
    now?: Date;
}) {
    const current = dayjs(value);
    const moment = dayjs(now);
    const today = moment.startOf('day');
    const days = Array.from({ length: DAYS }, (_, i) => today.add(i, 'day'));
    const setDay = (day: dayjs.Dayjs) =>
        onChange(day.hour(current.hour()).minute(current.minute()).second(0).millisecond(0).toDate());
    const setHour = (hour: number) => {
        const next = current.hour(hour).second(0).millisecond(0);
        onChange((next.isAfter(moment) ? next : roundUp(moment.add(1, 'minute'))).toDate());
    };
    const setMinute = (minute: number) => onChange(current.minute(minute).second(0).millisecond(0).toDate());
    const presets = [
        { label: m.schedule_in_hours({ n: 1 }), at: roundUp(moment.add(1, 'hour')) },
        { label: m.schedule_in_hours({ n: 3 }), at: roundUp(moment.add(3, 'hour')) },
        {
            label: m.schedule_tomorrow_at({ time: today.add(1, 'day').hour(8).format('LT') }),
            at: today.add(1, 'day').hour(8),
        },
    ];
    const inSec = (value.getTime() - now.getTime()) / 1000;
    const past = inSec <= 0;
    const isToday = current.isSame(moment, 'day');
    const hourPast = (h: number) => isToday && h < moment.hour();
    const minutePast = (n: number) => isToday && !current.minute(n).isAfter(moment);

    return (
        <fieldset
            aria-label={label}
            className="@container m-0 grid min-w-0 gap-4 rounded-3xl border-0 bg-secondary/60 p-3"
        >
            <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                    <Chip key={p.label} onClick={() => onChange(p.at.toDate())} active={p.at.isSame(current, 'minute')}>
                        <span className="inline-flex items-center gap-1.5">
                            <Zap className="size-3.5" />
                            {p.label}
                        </span>
                    </Chip>
                ))}
            </div>
            <fieldset
                aria-label={m.schedule_day()}
                className="-mx-1 m-0 flex min-w-0 gap-2 overflow-x-auto border-0 px-1 pb-1"
            >
                {days.map((d, i) => {
                    const active = d.isSame(current, 'day');
                    const name = i === 0 ? m.schedule_today() : i === 1 ? m.schedule_tomorrow() : d.format('ddd');
                    return (
                        <Chip
                            key={d.valueOf()}
                            active={active}
                            onClick={() => setDay(d)}
                            label={`${name} ${d.format('L')}`}
                            className="flex w-16 flex-col items-center gap-0.5 py-2"
                        >
                            <span className={cn('text-xs', active ? 'opacity-90' : 'text-muted-foreground')}>
                                {name}
                            </span>
                            <span className="text-lg font-semibold leading-none tabular-nums">{d.format('D')}</span>
                            <span className={cn('text-xs', active ? 'opacity-90' : 'text-muted-foreground')}>
                                {d.format('MMM')}
                            </span>
                        </Chip>
                    );
                })}
            </fieldset>
            <div className="grid min-w-0 gap-4 @2xl:grid-cols-[minmax(0,1fr)_13rem]">
                <fieldset aria-label={m.schedule_hour()} className="m-0 grid min-w-0 gap-2 border-0 p-0">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {m.schedule_hour()}
                    </span>
                    {PERIODS.map(({ from, icon: Icon, label: period }) => (
                        <div
                            key={from}
                            className="grid min-w-0 gap-1.5 @md:grid-cols-[6.5rem_minmax(0,1fr)] @md:items-center"
                        >
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Icon className="size-3.5 shrink-0" />
                                {period()}
                            </span>
                            <div className="grid grid-cols-6 gap-1.5">
                                {Array.from({ length: 6 }, (_, i) => from + i).map((h) => (
                                    <Chip
                                        key={h}
                                        active={current.hour() === h}
                                        disabled={hourPast(h)}
                                        onClick={() => setHour(h)}
                                        className="h-9 rounded-xl px-0 py-0 font-medium tabular-nums"
                                    >
                                        {pad(h)}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                    ))}
                </fieldset>
                <fieldset
                    aria-label={m.schedule_minute()}
                    className="m-0 grid min-w-0 content-start gap-2 border-0 p-0"
                >
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {m.schedule_minute()}
                    </span>
                    <div className="grid grid-cols-6 gap-1.5 @2xl:grid-cols-3">
                        {MINUTES.map((n) => (
                            <Chip
                                key={n}
                                active={current.minute() === n}
                                disabled={minutePast(n)}
                                onClick={() => setMinute(n)}
                                className="h-9 rounded-xl px-0 py-0 font-medium tabular-nums"
                            >
                                :{pad(n)}
                            </Chip>
                        ))}
                    </div>
                </fieldset>
            </div>
            <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-background/70 px-4 py-3">
                <span
                    data-testid="schedule-time"
                    className={cn(
                        'text-3xl font-semibold leading-none tabular-nums',
                        past ? 'text-destructive' : 'text-primary-strong',
                    )}
                >
                    {current.format('HH:mm')}
                </span>
                <p
                    role="status"
                    className={cn(
                        'inline-flex min-w-0 items-center gap-1.5 text-sm',
                        past ? 'text-destructive' : 'text-muted-foreground',
                    )}
                >
                    <CalendarClock className="size-4 shrink-0" />
                    <span className="min-w-0">
                        {past
                            ? m.schedule_past()
                            : `${current.format('dddd L')} · ${m.schedule_starts_in({ duration: formatDuration(inSec, { units: 2 }) })}`}
                    </span>
                </p>
            </div>
        </fieldset>
    );
}
