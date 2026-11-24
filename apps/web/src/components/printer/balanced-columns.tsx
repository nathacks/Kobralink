import { type ReactNode, useEffect, useRef, useState } from 'react';

export type Side = 'left' | 'right';
export type Heights = Record<Side, number>;

const GAP = 16;
const MIN_GAIN = 32;

export function balance(base: Heights, cards: Heights[], current: Side[], pinned: (Side | undefined)[] = []): Side[] {
    const gap = (sides: Side[]) =>
        Math.abs(
            sides.reduce(
                (diff, side, i) => diff + (side === 'left' ? 1 : -1) * (cards[i][side] + GAP),
                base.left - base.right,
            ),
        );
    const options = Array.from({ length: 2 ** cards.length }, (_, mask) =>
        cards.map((_, i): Side => pinned[i] ?? (mask & (1 << i) ? 'left' : 'right')),
    );
    const best = options.reduce((a, b) => (gap(b) < gap(a) ? b : a));
    return gap(best) + MIN_GAIN < gap(current) ? best : current;
}

function naturalHeight(wrapper: HTMLElement): number {
    wrapper.style.flexGrow = '0';
    const { height } = wrapper.getBoundingClientRect();
    wrapper.style.flexGrow = '';
    return height;
}

export function BalancedColumns({
    left,
    right,
    cards,
}: {
    left: ReactNode;
    right: ReactNode;
    cards: { key: string; node: ReactNode; side?: Side }[];
}) {
    const [sides, setSides] = useState<Side[]>(() => cards.map((c) => c.side ?? 'right'));
    const pinned = useRef(cards.map((c) => c.side));
    const leftRef = useRef<HTMLDivElement>(null);
    const rightRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const known = useRef<Partial<Heights>[]>([]);

    useEffect(() => {
        const l = leftRef.current;
        const r = rightRef.current;
        if (!l || !r) return;
        const measure = () => {
            const a = l.getBoundingClientRect();
            const b = r.getBoundingClientRect();
            if (a.left === b.left) {
                known.current = [];
                setSides((prev) => {
                    const next = prev.map((_, i): Side => pinned.current[i] ?? 'right');
                    return next.some((side, i) => side !== prev[i]) ? next : prev;
                });
                return;
            }
            const heights = sides.map((side, i): Heights => {
                const card = cardRefs.current[i];
                const height = card ? naturalHeight(card) : 0;
                known.current[i] = { ...known.current[i], [side]: height };
                const [own, other] = side === 'left' ? [a.width, b.width] : [b.width, a.width];
                const guess = height * Math.min(1, own / other);
                return { left: guess, right: guess, ...known.current[i] };
            });
            setSides(balance({ left: a.height, right: b.height }, heights, sides, pinned.current));
        };
        const observer = new ResizeObserver(measure);
        observer.observe(l);
        observer.observe(r);
        for (const ref of cardRefs.current) {
            for (const el of ref?.querySelectorAll(':scope > * > *, :scope > * > * > *') ?? []) observer.observe(el);
        }
        return () => observer.disconnect();
    }, [sides]);

    const placed = (side: Side) =>
        cards.map(
            ({ key, node }, i) =>
                sides[i] === side && (
                    <div
                        key={key}
                        ref={(el) => {
                            cardRefs.current[i] = el;
                        }}
                        className="flex min-w-0 flex-col last:grow *:grow"
                    >
                        {node}
                    </div>
                ),
        );

    return (
        <>
            <div className="flex min-w-0 flex-col gap-4">
                <div ref={leftRef} className="@container min-w-0">
                    {left}
                </div>
                {placed('left')}
            </div>
            <aside className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
                <div ref={rightRef} className="grid min-w-0 gap-4">
                    {right}
                </div>
                {placed('right')}
            </aside>
        </>
    );
}
