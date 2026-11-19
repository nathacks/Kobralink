import type { Locale as DateFnsLocale } from 'date-fns';
import { de, enUS, es, fr, it, ptBR, zhCN } from 'date-fns/locale';
import dayjs from 'dayjs';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDuration } from '@/lib/format';
import { getLocale, m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ClockDial } from './clock-dial';

const DATE_FNS_LOCALES: Record<string, DateFnsLocale> = {
    fr,
    en: enUS,
    de,
    es,
    it,
    'zh-cn': zhCN,
    'pt-br': ptBR,
};

type Step = 'date' | 'hour' | 'minute';

const pad = (n: number) => String(n).padStart(2, '0');

export function defaultStart(now: Date): Date {
    return dayjs(now).add(1, 'hour').startOf('hour').toDate();
}

function HeaderPart({
    active,
    onClick,
    children,
    label,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    label: string;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                'rounded-xl px-2 py-1 tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-background/60',
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
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>('date');
    const [draft, setDraft] = useState(value);
    const current = dayjs(draft);
    const inSec = Math.ceil((value.getTime() - now.getTime()) / 60_000) * 60;
    const past = value.getTime() <= now.getTime();

    const toggle = (next: boolean) => {
        if (next) {
            setDraft(value);
            setStep('date');
        }
        setOpen(next);
    };

    return (
        <div className="grid min-w-0 gap-1.5">
            <Popover open={open} onOpenChange={toggle}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        aria-label={label}
                        className="justify-start gap-2 rounded-full px-4 font-normal tabular-nums"
                    >
                        <CalendarClock className="text-primary-strong" />
                        <span className="first-letter:uppercase">{dayjs(value).format('ddd L · LT')}</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[19.5rem] overflow-hidden rounded-3xl p-0">
                    <div className="flex items-center justify-between gap-4 bg-primary/15 px-4 py-3">
                        <HeaderPart active={step === 'date'} onClick={() => setStep('date')} label={m.schedule_day()}>
                            <span className="text-sm first-letter:uppercase">{current.format('ddd L')}</span>
                        </HeaderPart>
                        <div className="flex items-center text-2xl font-semibold">
                            <HeaderPart
                                active={step === 'hour'}
                                onClick={() => setStep('hour')}
                                label={m.schedule_hour()}
                            >
                                {pad(current.hour())}
                            </HeaderPart>
                            <span className="text-muted-foreground">:</span>
                            <HeaderPart
                                active={step === 'minute'}
                                onClick={() => setStep('minute')}
                                label={m.schedule_minute()}
                            >
                                {pad(current.minute())}
                            </HeaderPart>
                        </div>
                    </div>
                    <div className="flex min-h-72 items-center justify-center p-3">
                        {step === 'date' ? (
                            <Calendar
                                mode="single"
                                required
                                selected={draft}
                                defaultMonth={draft}
                                locale={DATE_FNS_LOCALES[getLocale()] ?? enUS}
                                disabled={{ before: dayjs(now).startOf('day').toDate() }}
                                onSelect={(day) => {
                                    if (!day) return;
                                    setDraft(
                                        dayjs(day)
                                            .hour(current.hour())
                                            .minute(current.minute())
                                            .second(0)
                                            .millisecond(0)
                                            .toDate(),
                                    );
                                    setStep('hour');
                                }}
                            />
                        ) : (
                            <ClockDial
                                key={step}
                                mode={step}
                                label={step === 'hour' ? m.schedule_hour() : m.schedule_minute()}
                                value={step === 'hour' ? current.hour() : current.minute()}
                                onChange={(v) =>
                                    setDraft(
                                        (step === 'hour' ? current.hour(v) : current.minute(v))
                                            .second(0)
                                            .millisecond(0)
                                            .toDate(),
                                    )
                                }
                                onCommit={() => {
                                    if (step === 'hour') setStep('minute');
                                }}
                            />
                        )}
                    </div>
                    <div className="flex justify-end gap-2 px-4 pb-4">
                        <Button type="button" variant="ghost" className="rounded-full" onClick={() => setOpen(false)}>
                            {m.common_cancel()}
                        </Button>
                        <Button
                            type="button"
                            className="rounded-full"
                            onClick={() => {
                                onChange(draft);
                                setOpen(false);
                            }}
                        >
                            {m.common_ok()}
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
            <p role="status" className={cn('px-4 text-xs', past ? 'text-destructive' : 'text-muted-foreground')}>
                {past
                    ? m.schedule_past()
                    : m.schedule_starts_in({ duration: formatDuration(inSec, { units: inSec < 3600 ? 1 : 2 }) })}
            </p>
        </div>
    );
}
