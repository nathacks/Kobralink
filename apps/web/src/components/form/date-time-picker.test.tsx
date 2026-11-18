import { render, screen } from '@testing-library/react';
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
        expect(screen.getByRole('combobox', { name: m.schedule_hour() }).textContent).toBe('12');
    });

    it('warns about a time in the past', () => {
        render(<Harness initial={new Date(2026, 10, 17, 9, 0)} onChange={vi.fn()} />);
        expect(screen.getByRole('status').textContent).toContain(m.schedule_past());
    });
});
