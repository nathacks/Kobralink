import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { m } from '@/lib/i18n';
import { StatusCounters } from './status-counters';

const printers = [
    { id: 'a', name: 'Kobra A', live: { connected: true, printState: 'printing', remainTimeSec: 600 } },
    { id: 'b', name: 'Kobra B', live: { connected: true, printState: 'standby', remainTimeSec: 0 } },
    { id: 'c', name: 'Kobra C', live: null },
] as unknown as PrinterWithLive[];

describe('StatusCounters', () => {
    it('shows the total and only the statuses that have printers', () => {
        render(<StatusCounters printers={printers} active={undefined} onSelect={vi.fn()} />);
        expect(screen.getByRole('button', { name: `${m.home_filter_all()} 3` })).toBeTruthy();
        expect(screen.getByRole('button', { name: `${m.home_count_printing()} 1` })).toBeTruthy();
        expect(screen.getByRole('button', { name: `${m.home_count_ready()} 1` })).toBeTruthy();
        expect(screen.getByRole('button', { name: `${m.home_count_offline()} 1` })).toBeTruthy();
        expect(screen.queryByRole('button', { name: new RegExp(m.home_count_paused()) })).toBeNull();
    });

    it('filters by a status and clears the filter on a second click', async () => {
        const onSelect = vi.fn();
        const { rerender } = render(<StatusCounters printers={printers} active={undefined} onSelect={onSelect} />);
        await userEvent.click(screen.getByRole('button', { name: `${m.home_count_printing()} 1` }));
        expect(onSelect).toHaveBeenLastCalledWith('printing');
        rerender(<StatusCounters printers={printers} active="printing" onSelect={onSelect} />);
        const printing = screen.getByRole('button', { name: `${m.home_count_printing()} 1` });
        expect(printing.getAttribute('aria-pressed')).toBe('true');
        await userEvent.click(printing);
        expect(onSelect).toHaveBeenLastCalledWith(undefined);
    });

    it('keeps an active filter visible even when no printer matches anymore', () => {
        render(<StatusCounters printers={printers} active="paused" onSelect={vi.fn()} />);
        expect(screen.getByRole('button', { name: `${m.home_count_paused()} 0` })).toBeTruthy();
    });

    it('tells which print ends first', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-30T10:00:00'));
        render(<StatusCounters printers={printers} active={undefined} onSelect={vi.fn()} />);
        expect(
            screen.getByText(m.home_next_finish({ name: 'Kobra A', time: formatClock(Date.now() + 600_000) })),
        ).toBeTruthy();
        vi.useRealTimers();
    });
});
