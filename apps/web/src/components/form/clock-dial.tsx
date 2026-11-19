import type { KeyboardEvent, PointerEvent } from 'react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

const SIZE = 256;
const CENTER = SIZE / 2;
const OUTER = 100;
const INNER = 64;
const INNER_LIMIT = (OUTER + INNER) / 2;

export type DialMode = 'hour' | 'minute';

const pad = (n: number) => String(n).padStart(2, '0');

function point(index: number, radius: number) {
    const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
    return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function hourRing(hour: number): { index: number; radius: number } {
    const index = hour % 12;
    const inner = hour === 0 || hour > 12;
    return { index, radius: inner ? INNER : OUTER };
}

export function valueAt(mode: DialMode, dx: number, dy: number): number {
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    if (mode === 'minute') return Math.round((angle / (2 * Math.PI)) * 60) % 60;
    const index = Math.round((angle / (2 * Math.PI)) * 12) % 12;
    const inner = Math.hypot(dx, dy) < INNER_LIMIT;
    if (inner) return index === 0 ? 0 : index + 12;
    return index === 0 ? 12 : index;
}

export function ClockDial({
    mode,
    value,
    onChange,
    onCommit,
    label,
}: {
    mode: DialMode;
    value: number;
    onChange: (value: number) => void;
    onCommit?: (value: number) => void;
    label: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const last = useRef(value);

    const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect?.width) return null;
        const scale = SIZE / rect.width;
        const dx = (e.clientX - rect.left) * scale - CENTER;
        const dy = (e.clientY - rect.top) * scale - CENTER;
        return valueAt(mode, dx, dy);
    };
    const move = (e: PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        const v = fromPointer(e);
        if (v === null || v === last.current) return;
        last.current = v;
        onChange(v);
    };
    const keys: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onCommit?.(value);
            return;
        }
        const step = keys[e.key];
        if (!step) return;
        e.preventDefault();
        const span = mode === 'hour' ? 24 : 60;
        onChange((value + step * (mode === 'minute' && e.shiftKey ? 5 : 1) + span) % span);
    };

    const marks =
        mode === 'hour'
            ? [
                  ...Array.from({ length: 12 }, (_, i) => ({
                      value: i === 0 ? 12 : i,
                      ...point(i, OUTER),
                      inner: false,
                  })),
                  ...Array.from({ length: 12 }, (_, i) => ({
                      value: i === 0 ? 0 : i + 12,
                      ...point(i, INNER),
                      inner: true,
                  })),
              ]
            : Array.from({ length: 12 }, (_, i) => ({ value: i * 5, ...point(i, OUTER), inner: false }));
    const hand =
        mode === 'hour' ? point(hourRing(value).index, hourRing(value).radius) : point((value / 60) * 12, OUTER);
    const onMark = mode === 'hour' || value % 5 === 0;

    return (
        <div
            ref={ref}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={mode === 'hour' ? 23 : 59}
            aria-valuenow={value}
            aria-valuetext={pad(value)}
            className="size-64 cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                move(e);
            }}
            onPointerMove={move}
            onPointerUp={(e) => {
                if (!dragging.current) return;
                dragging.current = false;
                const v = fromPointer(e) ?? last.current;
                onCommit?.(v);
            }}
            onKeyDown={onKey}
        >
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" aria-hidden="true">
                <circle cx={CENTER} cy={CENTER} r={CENTER - 4} className="fill-secondary" />
                <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={hand.x}
                    y2={hand.y}
                    className="stroke-primary"
                    strokeWidth={2}
                    strokeLinecap="round"
                />
                <circle cx={CENTER} cy={CENTER} r={4} className="fill-primary" />
                <circle cx={hand.x} cy={hand.y} r={18} className="fill-primary" />
                {!onMark && <circle cx={hand.x} cy={hand.y} r={3} className="fill-primary-foreground" />}
                {marks.map((mk) => {
                    const selected = mk.value === value;
                    return (
                        <text
                            key={`${mk.inner}-${mk.value}`}
                            x={mk.x}
                            y={mk.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className={cn(
                                'tabular-nums',
                                mk.inner ? 'text-[12px]' : 'text-[15px]',
                                selected
                                    ? 'fill-primary-foreground font-semibold'
                                    : mk.inner
                                      ? 'fill-muted-foreground'
                                      : 'fill-foreground',
                            )}
                        >
                            {mode === 'minute' || mk.inner ? pad(mk.value) : mk.value}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
}
