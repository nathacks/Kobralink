import dayjs from 'dayjs';
import { CalendarClock, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const DAYS = 14;
const MINUTE_STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

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
    onClick,
    children,
    className,
    label,
}: {
    active?: boolean;
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
            onClick={onClick}
            className={cn(
                'shrink-0 rounded-2xl px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                    ? 'bg-primary text-primary-foreground'
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
    const today = dayjs(now).startOf('day');
    const days = Array.from({ length: DAYS }, (_, i) => today.add(i, 'day'));
    const setDay = (day: dayjs.Dayjs) =>
        onChange(day.hour(current.hour()).minute(current.minute()).second(0).millisecond(0).toDate());
    const setTime = (hour: number, minute: number) => onChange(current.hour(hour).minute(minute).second(0).toDate());
    const presets = [
        { label: m.schedule_in_hours({ n: 1 }), at: roundUp(dayjs(now).add(1, 'hour')) },
        { label: m.schedule_in_hours({ n: 3 }), at: roundUp(dayjs(now).add(3, 'hour')) },
        {
            label: m.schedule_tomorrow_at({ time: today.add(1, 'day').hour(8).format('LT') }),
            at: today.add(1, 'day').hour(8),
        },
    ];
    const inSec = (value.getTime() - now.getTime()) / 1000;
    const past = inSec <= 0;
    const minute = MINUTES.includes(current.minute()) ? current.minute() : null;

    return (
        <fieldset aria-label={label} className="m-0 grid min-w-0 gap-3 rounded-3xl border-0 bg-secondary/60 p-3">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                    <Select value={String(current.hour())} onValueChange={(v) => setTime(Number(v), current.minute())}>
                        <SelectTrigger aria-label={m.schedule_hour()} className="w-20 rounded-full tabular-nums">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-64 rounded-2xl">
                            {HOURS.map((h) => (
                                <SelectItem key={h} value={String(h)} className="rounded-xl tabular-nums">
                                    {pad(h)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="text-lg font-semibold text-muted-foreground">:</span>
                    <Select
                        value={minute === null ? undefined : String(minute)}
                        onValueChange={(v) => setTime(current.hour(), Number(v))}
                    >
                        <SelectTrigger aria-label={m.schedule_minute()} className="w-20 rounded-full tabular-nums">
                            <SelectValue placeholder={pad(current.minute())} />
                        </SelectTrigger>
                        <SelectContent className="max-h-64 rounded-2xl">
                            {MINUTES.map((n) => (
                                <SelectItem key={n} value={String(n)} className="rounded-xl tabular-nums">
                                    {pad(n)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <p
                    role="status"
                    className={cn(
                        'inline-flex min-w-0 items-center gap-1.5 text-sm',
                        past ? 'text-destructive' : 'text-muted-foreground',
                    )}
                >
                    <CalendarClock className="size-4 shrink-0" />
                    <span className="truncate">
                        {past
                            ? m.schedule_past()
                            : `${current.format('dddd L LT')} · ${m.schedule_starts_in({ duration: formatDuration(inSec, { units: 2 }) })}`}
                    </span>
                </p>
            </div>
        </fieldset>
    );
}
