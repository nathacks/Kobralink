import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ClockDial, type DialMode, valueAt } from './clock-dial';

describe('valueAt', () => {
    it('reads the outer ring as 1 to 12 and the inner ring as 00 and 13 to 23', () => {
        expect(valueAt('hour', 0, -100)).toBe(12);
        expect(valueAt('hour', 0, -60)).toBe(0);
        expect(valueAt('hour', 100, 0)).toBe(3);
        expect(valueAt('hour', 60, 0)).toBe(15);
        expect(valueAt('hour', 0, 100)).toBe(6);
        expect(valueAt('hour', 0, 60)).toBe(18);
        expect(valueAt('hour', -100, 0)).toBe(9);
        expect(valueAt('hour', -60, 0)).toBe(21);
    });

    it('reads any minute around the dial', () => {
        expect(valueAt('minute', 0, -100)).toBe(0);
        expect(valueAt('minute', 100, 0)).toBe(15);
        expect(valueAt('minute', 0, 100)).toBe(30);
        expect(valueAt('minute', -100, 0)).toBe(45);
        const a = (7 / 60) * 2 * Math.PI - Math.PI / 2;
        expect(valueAt('minute', Math.cos(a) * 90, Math.sin(a) * 90)).toBe(7);
    });
});

function Harness({ mode, initial, onCommit }: { mode: DialMode; initial: number; onCommit: (v: number) => void }) {
    const [value, setValue] = useState(initial);
    return <ClockDial mode={mode} value={value} onChange={setValue} onCommit={onCommit} label="Dial" />;
}

describe('ClockDial', () => {
    it('is a slider with the 24 hours or the minutes in 5 steps as marks', () => {
        const { container, rerender } = render(<ClockDial mode="hour" value={8} onChange={vi.fn()} label="Hour" />);
        const slider = screen.getByRole('slider', { name: 'Hour' });
        expect(slider.getAttribute('aria-valuenow')).toBe('8');
        expect(slider.getAttribute('aria-valuemax')).toBe('23');
        expect(container.querySelectorAll('text')).toHaveLength(24);
        rerender(<ClockDial mode="minute" value={30} onChange={vi.fn()} label="Minute" />);
        expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('59');
        expect(container.querySelectorAll('text')).toHaveLength(12);
    });

    it('moves with the arrow keys, wraps around and commits with Enter', () => {
        const onCommit = vi.fn();
        render(<Harness mode="hour" initial={23} onCommit={onCommit} />);
        const slider = screen.getByRole('slider');
        fireEvent.keyDown(slider, { key: 'ArrowUp' });
        expect(slider.getAttribute('aria-valuenow')).toBe('0');
        fireEvent.keyDown(slider, { key: 'ArrowDown' });
        fireEvent.keyDown(slider, { key: 'ArrowDown' });
        expect(slider.getAttribute('aria-valuenow')).toBe('22');
        fireEvent.keyDown(slider, { key: 'Enter' });
        expect(onCommit).toHaveBeenCalledWith(22);
    });

    it('steps minutes by five with shift', () => {
        render(<Harness mode="minute" initial={55} onCommit={vi.fn()} />);
        const slider = screen.getByRole('slider');
        fireEvent.keyDown(slider, { key: 'ArrowUp', shiftKey: true });
        expect(slider.getAttribute('aria-valuenow')).toBe('0');
        fireEvent.keyDown(slider, { key: 'ArrowUp' });
        expect(slider.getAttribute('aria-valuenow')).toBe('1');
    });
});
