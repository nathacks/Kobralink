import type { PrinterLiveState } from '@kobralink/shared';
import { KOBRA_STATE_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

export function StatusBadge({ state, className }: { state: PrinterLiveState; className?: string }) {
    const label = KOBRA_STATE_LABEL[state.kobraState] ?? state.kobraState;
    const dot = !state.connected
        ? 'bg-muted-foreground/60'
        : state.printState === 'error'
          ? 'bg-destructive'
          : state.printState === 'printing'
            ? 'bg-primary animate-pulse'
            : 'bg-primary';
    return (
        <span
            className={cn(
                'inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground',
                className,
            )}
        >
            <span className={cn('size-2 rounded-full', dot)} />
            {label}
        </span>
    );
}
