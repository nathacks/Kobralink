import { useId } from 'react';

interface Props {
    values: number[];
    className?: string;
    color?: string;
    label?: string;
}

const W = 240;
const H = 100;
const PAD_X = 6;
const TOP = 26;
const BOTTOM = 14;

function smoothPath(points: [number, number][]): string {
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        const cx = (x0 + x1) / 2;
        d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
}

export function Sparkline({ values, className, color = 'var(--primary)', label }: Props) {
    const id = useId();
    const data = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const points: [number, number][] = data.map((v, i) => [
        PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2),
        H - BOTTOM - ((v - min) / span) * (H - TOP - BOTTOM),
    ]);
    const path = smoothPath(points);
    const last = points[points.length - 1];
    const area = `${path} L ${last[0]} ${H} L ${points[0][0]} ${H} Z`;
    const dotLeft = `${(last[0] / W) * 100}%`;
    const dotTop = `${(last[1] / H) * 100}%`;
    return (
        <div className={`relative ${className ?? ''}`}>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="size-full"
                preserveAspectRatio="none"
                role="img"
                aria-label={label ?? 'tendance'}
            >
                <defs>
                    <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={area} fill={`url(#${id})`} />
                <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            <div
                className="pointer-events-none absolute w-px border-l border-dashed"
                style={{ left: dotLeft, top: dotTop, bottom: 0, borderColor: color, opacity: 0.6 }}
            />
            <div
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                style={{ left: dotLeft, top: dotTop, background: color }}
            />
            {label && (
                <div
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ left: dotLeft, top: dotTop, background: color, color: 'var(--primary-foreground)' }}
                >
                    {label}
                </div>
            )}
        </div>
    );
}
