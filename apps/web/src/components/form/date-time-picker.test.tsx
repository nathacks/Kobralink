import { fireEvent, render, screen, within } from '@testing-library/react';
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

const day = (d: Date) => document.querySelector(`[data-day="${d.toLocaleDateString()}"]`) as HTMLElement;

describe('defaultStart', () => {
    it('starts at the next full hour', () => {
        expect(defaultStart(now)).toEqual(new Date(2026, 10, 17, 11, 0));
    });
});

describe('DateTimePicker', () => {
    it('shows the chosen time on a button and when it starts', () => {
        render(<Harness initial={new Date(2026, 10, 17, 12, 7)} onChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Start at' }).textContent).toContain('12:07');
        expect(screen.getByRole('status').textContent).toBe(
            m.schedule_starts_in({ duration: formatDuration(7200, { units: 2 }) }),
        );
    });

    it('rounds the countdown to minutes', () => {
        render(<Harness initial={new Date(2026, 10, 17, 10, 51, 20)} onChange={vi.fn()} />);
        expect(screen.getByRole('status').textContent).toBe(
            m.schedule_starts_in({ duration: formatDuration(45 * 60, { units: 1 }) }),
        );
    });

    it('warns about a time in the past', () => {
        render(<Harness initial={new Date(2026, 10, 17, 9, 0)} onChange={vi.fn()} />);
        expect(screen.getByRole('status').textContent).toBe(m.schedule_past());
    });

    it('opens a calendar, then an hour dial, then a minute dial, and applies on OK', async () => {
        const onChange = vi.fn();
        render(<Harness initial={defaultStart(now)} onChange={onChange} />);
        await userEvent.click(screen.getByRole('button', { name: 'Start at' }));
        expect(screen.getByRole('grid')).toBeTruthy();
        expect(day(new Date(2026, 10, 16)).hasAttribute('disabled')).toBe(true);
        await userEvent.click(day(new Date(2026, 10, 20)));
        const hour = screen.getByRole('slider', { name: m.schedule_hour() });
        for (let i = 0; i < 3; i++) fireEvent.keyDown(hour, { key: 'ArrowUp' });
        fireEvent.keyDown(hour, { key: 'Enter' });
        const minute = screen.getByRole('slider', { name: m.schedule_minute() });
        for (let i = 0; i < 6; i++) fireEvent.keyDown(minute, { key: 'ArrowUp', shiftKey: true });
        expect(onChange).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: m.common_ok() }));
        expect(onChange).toHaveBeenCalledWith(new Date(2026, 10, 20, 14, 30));
        expect(screen.queryByRole('slider')).toBeNull();
    });

    it('switches between the day, the hour and the minute from the header', async () => {
        render(<Harness initial={defaultStart(now)} onChange={vi.fn()} />);
        await userEvent.click(screen.getByRole('button', { name: 'Start at' }));
        const header = screen.getByRole('button', { name: m.schedule_minute() });
        await userEvent.click(header);
        expect(screen.getByRole('slider', { name: m.schedule_minute() })).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.schedule_hour() }));
        expect(screen.getByRole('slider', { name: m.schedule_hour() })).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.schedule_day() }));
        expect(within(document.body).getByRole('grid')).toBeTruthy();
    });

    it('discards the draft on cancel', async () => {
        const onChange = vi.fn();
        render(<Harness initial={defaultStart(now)} onChange={onChange} />);
        await userEvent.click(screen.getByRole('button', { name: 'Start at' }));
        await userEvent.click(day(new Date(2026, 10, 20)));
        await userEvent.click(screen.getByRole('button', { name: m.common_cancel() }));
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Start at' }).textContent).toContain('11/17/2026');
    });
});
