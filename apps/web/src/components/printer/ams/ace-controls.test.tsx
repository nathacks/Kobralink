import type { AceUnit } from '@kobralink/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { AceControls } from './ace-controls';

const mocks = vi.hoisted(() => ({ create: vi.fn(), dry: vi.fn() }));

vi.mock('@/lib/api', () => ({
    api: new Proxy(
        {
            ams: { dry: mocks.dry, autoFeed: vi.fn() },
            drySchedule: { create: mocks.create, list: vi.fn().mockResolvedValue([]), remove: vi.fn() },
            settings: { get: vi.fn().mockResolvedValue({ aceDryPresets: [] }) },
        } as Record<string, unknown>,
        { get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }) },
    ),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const unit = {
    id: 0,
    autoFeed: false,
    drying: { status: 0, humidity: 40, targetTemp: 0, remainTime: 0, temp: 25 },
} as unknown as AceUnit;

beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({});
    mocks.dry.mockReset().mockResolvedValue({});
});

async function openSchedule() {
    const view = await renderWithProviders(<AceControls printerId="p1" units={[unit]} disabled={false} busy={false} />);
    await userEvent.click(screen.getByRole('button', { name: m.ace_schedule() }));
    const submit = view.container.querySelector('button[type="submit"]') as HTMLButtonElement;
    return { ...view, submit };
}

describe('AceControls scheduled drying', () => {
    it('picks the start with the date and time picker instead of a native input', async () => {
        const { container } = await openSchedule();
        expect(screen.getByRole('button', { name: m.ace_schedule_at() })).toBeTruthy();
        expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    });

    it('schedules the drying at the chosen time', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 17, 10, 7));
        try {
            const { submit } = await openSchedule();
            await userEvent.click(screen.getByRole('button', { name: m.ace_schedule_at() }));
            await userEvent.click(
                document.querySelector(`[data-day="${new Date(2026, 10, 19).toLocaleDateString()}"]`) as HTMLElement,
            );
            const hour = screen.getByRole('slider', { name: m.schedule_hour() });
            for (let i = 0; i < 9; i++) fireEvent.keyDown(hour, { key: 'ArrowUp' });
            fireEvent.keyDown(hour, { key: 'Enter' });
            await userEvent.click(screen.getByRole('button', { name: m.common_ok() }));
            await userEvent.click(submit);
            await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
        } finally {
            vi.useRealTimers();
        }
        expect(mocks.create).toHaveBeenCalledWith('p1', {
            targetTemp: 45,
            duration: 240,
            startAt: new Date(2026, 10, 19, 20, 0).toISOString(),
            aceId: null,
        });
        expect(mocks.dry).not.toHaveBeenCalled();
    });

    it('does not schedule a time in the past', async () => {
        const { submit } = await openSchedule();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 3 * 3_600_000);
        await userEvent.click(submit);
        vi.useRealTimers();
        expect(mocks.create).not.toHaveBeenCalled();
    });
});

describe('AceControls drying fault', () => {
    const withStatus = (status: number) =>
        ({ ...unit, drying: { ...unit.drying, status, targetTemp: 45, remainTime: 120 } }) as unknown as AceUnit;

    it('shows a drying fault instead of a running drying', async () => {
        await renderWithProviders(<AceControls printerId="p1" units={[withStatus(2)]} disabled={false} busy={false} />);
        expect(screen.getByRole('alert').textContent).toBe(m.ace_drying_fault());
        expect(screen.queryByText(m.ace_drying_status({ temp: 45, duration: '2h' }))).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: m.common_stop() }));
        await waitFor(() => expect(mocks.dry).toHaveBeenCalledWith('p1', { action: 'stop' }));
    });

    it('shows the unit that is drying over one with a fault', async () => {
        await renderWithProviders(
            <AceControls
                printerId="p1"
                units={[withStatus(2), { ...withStatus(1), id: 1 } as AceUnit]}
                disabled={false}
                busy={false}
            />,
        );
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('button', { name: m.common_stop() })).toBeTruthy();
    });
});
