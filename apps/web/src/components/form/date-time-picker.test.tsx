import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { formatDuration } from '@/lib/format';
import { m } from '@/lib/i18n';
import { DateTimePicker, defaultStart } from './date-time-picker';

const now = new Date(2026, 10, 17, 10, 7);

function Harness({ initial, onChange }: { initial: Date; onChange: (d: Date) => void }) {
    const [value, setValue] = useState(initial);
    return (
        <DateTimePicker
            value={value}
            now={now}
            label="Start at"
            onChange={(d) => {
                setValue(d);
                onChange(d);
            }}
        />
    );
}

describe('defaultStart', () => {
    it('starts at the next full hour', () => {
        expect(defaultStart(now)).toEqual(new Date(2026, 10, 17, 11, 0));
    });
});

describe('DateTimePicker', () => {
    it('offers the next two weeks, today first', () => {
        render(<Harness initial={defaultStart(now)} onChange={vi.fn()} />);
        const days = screen.getByRole('group', { name: m.schedule_day() }).querySelectorAll('button');
        expect(days).toHaveLength(14);
        expect(days[0]?.getAttribute('aria-pressed')).toBe('true');
        expect(days[0]?.textContent).toContain(m.schedule_today());
        expect(days[1]?.textContent).toContain(m.schedule_tomorrow());
    });

    it('jumps to a quick choice rounded to five minutes', async () => {
        const onChange = vi.fn();
        render(<Harness initial={defaultStart(now)} onChange={onChange} />);
        await userEvent.click(screen.getByRole('button', { name: m.schedule_in_hours({ n: 1 }) }));
        expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 17, 11, 10));
        await userEvent.click(screen.getByRole('button', { name: /^Tomorrow, / }));
        expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 18, 8, 0));
    });

    it('changes the day and keeps the time', async () => {
        const onChange = vi.fn();
        render(<Harness initial={new Date(2026, 10, 17, 21, 30)} onChange={onChange} />);
        await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${m.schedule_tomorrow()} `) }));
        expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 18, 21, 30));
    });

    it('says when the print will start', () => {
        render(<Harness initial={new Date(2026, 10, 17, 12, 7)} onChange={vi.fn()} />);
        expect(screen.getByRole('status').textContent).toContain(
            m.schedule_starts_in({ duration: formatDuration(7200, { units: 2 }) }),
        );
        expect(screen.getByTestId('schedule-time').textContent).toBe('12:07');
    });

    it('lays the 24 hours out by period of the day', () => {
        render(<Harness initial={new Date(2026, 10, 18, 6, 0)} onChange={vi.fn()} />);
        const hours = within(screen.getByRole('group', { name: m.schedule_hour() })).getAllByRole('button');
        expect(hours.map((b) => b.textContent)).toEqual(
            Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
        );
        for (const period of [
            m.schedule_period_night(),
            m.schedule_period_morning(),
            m.schedule_period_afternoon(),
            m.schedule_period_evening(),
        ]) {
            expect(screen.getByText(period)).toBeTruthy();
        }
        expect(hours[6]?.getAttribute('aria-pressed')).toBe('true');
        expect(hours[18]?.getAttribute('aria-pressed')).toBe('false');
    });

    it('picks an hour in the 24 h grid without an AM/PM switch', async () => {
        const onChange = vi.fn();
        render(<Harness initial={new Date(2026, 10, 18, 18, 30)} onChange={onChange} />);
        const hours = screen.getByRole('group', { name: m.schedule_hour() });
        await userEvent.click(within(hours).getByRole('button', { name: '06' }));
        expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 18, 6, 30));
        expect(screen.getByTestId('schedule-time').textContent).toBe('06:30');
    });

    it('picks the minute in five-minute steps', async () => {
        const onChange = vi.fn();
        render(<Harness initial={new Date(2026, 10, 18, 6, 0)} onChange={onChange} />);
        const minutes = within(screen.getByRole('group', { name: m.schedule_minute() })).getAllByRole('button');
        expect(minutes).toHaveLength(12);
        await userEvent.click(
            within(screen.getByRole('group', { name: m.schedule_minute() })).getByRole('button', { name: ':45' }),
        );
        expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 18, 6, 45));
    });

    it('disables the hours and minutes already gone today', () => {
        render(<Harness initial={new Date(2026, 10, 17, 10, 30)} onChange={vi.fn()} />);
        const hours = within(screen.getByRole('group', { name: m.schedule_hour() })).getAllByRole('button');
        expect(hours.slice(0, 10).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
        expect(hours.slice(10).some((b) => (b as HTMLButtonElement).disabled)).toBe(false);
        const minutes = within(screen.getByRole('group', { name: m.schedule_minute() })).getAllByRole('button');
        expect(minutes.map((b) => (b as HTMLButtonElement).disabled)).toEqual([
            true,
            true,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
        ]);
    });

    it('keeps every slot open on a later day', () => {
        render(<Harness initial={new Date(2026, 10, 18, 3, 0)} onChange={vi.fn()} />);
        const buttons = [
            ...within(screen.getByRole('group', { name: m.schedule_hour() })).getAllByRole('button'),
            ...within(screen.getByRole('group', { name: m.schedule_minute() })).getAllByRole('button'),
        ];
        expect(buttons.some((b) => (b as HTMLButtonElement).disabled)).toBe(false);
    });

    it('moves to the next free minute when the current hour would be in the past', async () => {
        const onChange = vi.fn();
        render(<Harness initial={new Date(2026, 10, 17, 14, 0)} onChange={onChange} />);
        await userEvent.click(
            within(screen.getByRole('group', { name: m.schedule_hour() })).getByRole('button', { name: '10' }),
        );
        expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 10, 17, 10, 10));
    });

    it('warns about a time in the past', () => {
        render(<Harness initial={new Date(2026, 10, 17, 9, 0)} onChange={vi.fn()} />);
        expect(screen.getByRole('status').textContent).toContain(m.schedule_past());
    });
});
