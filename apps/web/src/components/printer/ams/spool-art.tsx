import { useSlotSpool } from '@/hooks/use-slot-spool';
import { isDark } from '@/lib/color';
import { cn } from '@/lib/utils';

const HUB_R = 17;
const FULL_R = 44;
const SPOKES = [0, 120, 240];

export function spoolRadius(fraction: number): number {
    const f = Math.min(1, Math.max(0, fraction));
    return Math.sqrt(HUB_R ** 2 + (FULL_R ** 2 - HUB_R ** 2) * f);
}

export function SpoolArt({
    color,
    fraction = 1,
    className,
}: {
    color?: string;
    fraction?: number;
    className?: string;
}) {
    return (
        <svg viewBox="0 0 100 100" aria-hidden="true" className={cn('aspect-square shrink-0', className)}>
            <circle cx="50" cy="50" r="48" className="fill-muted-foreground/15" />
            <circle cx="50" cy="50" r={FULL_R} className="fill-none stroke-muted-foreground/25" strokeDasharray="2 3" />
            {color && (
                <circle
                    data-filament
                    cx="50"
                    cy="50"
                    r={spoolRadius(fraction)}
                    fill={color}
                    stroke={isDark(color) ? 'white' : 'black'}
                    strokeOpacity="0.15"
                    strokeWidth="1"
                />
            )}
            <circle cx="50" cy="50" r={HUB_R} className="fill-secondary" />
            {SPOKES.map((deg) => {
                const a = ((deg - 90) * Math.PI) / 180;
                return (
                    <circle
                        key={deg}
                        cx={50 + 10 * Math.cos(a)}
                        cy={50 + 10 * Math.sin(a)}
                        r="3"
                        className="fill-card"
                    />
                );
            })}
            <circle cx="50" cy="50" r="4" className="fill-card" />
        </svg>
    );
}

export function SpoolProgress({
    fraction,
    color,
    className,
}: {
    fraction?: number;
    color?: string;
    className?: string;
}) {
    if (fraction === undefined) return null;
    const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    return (
        <div className={cn('flex w-full items-center gap-2', className)}>
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10"
            >
                <div
                    className="h-full rounded-full bg-primary shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]"
                    style={{ width: `${percent}%`, background: color }}
                />
            </div>
            <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {percent}%
            </span>
        </div>
    );
}

export function slotFraction(spoolFraction: number | undefined, remainingPct: number | undefined): number | undefined {
    if (spoolFraction !== undefined) return spoolFraction;
    return remainingPct !== undefined ? Math.min(1, Math.max(0, remainingPct / 100)) : undefined;
}

export function SlotSpool({
    printerId,
    slotKey,
    color,
    empty,
    remainingPct,
    className,
    children,
}: {
    printerId: string;
    slotKey: string;
    color?: string;
    empty?: boolean;
    remainingPct?: number;
    className?: string;
    children?: React.ReactNode;
}) {
    const spool = useSlotSpool(printerId, slotKey);
    const fill = empty ? undefined : (color ?? spool.hex);
    const fraction = slotFraction(spool.fraction, remainingPct);
    return (
        <SpoolTileBody color={fill} fraction={fill ? fraction : undefined} className={className}>
            {children}
        </SpoolTileBody>
    );
}

export function SpoolTileBody({
    color,
    fraction,
    className,
    children,
}: {
    color?: string;
    fraction?: number;
    className?: string;
    children?: React.ReactNode;
}) {
    return (
        <>
            <SpoolArt color={color} fraction={fraction ?? 1} className={cn('size-12', className)} />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                {children}
                {fraction !== undefined ? (
                    <SpoolProgress fraction={fraction} color={color} />
                ) : (
                    <span className="h-4" />
                )}
            </span>
        </>
    );
}
