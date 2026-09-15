import type { PrinterLiveState } from '@kobralink/shared';
import { useEffect, useState } from 'react';

export function usePrintClock(state: PrinterLiveState): { elapsedSec: number; remainSec: number } {
    const running = state.printState === 'printing' && state.printTimeAt > 0;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!running) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [running]);
    const extra = running ? Math.min(59, Math.max(0, Math.floor((now - state.printTimeAt) / 1000))) : 0;
    return {
        elapsedSec: state.printDurationSec + extra,
        remainSec: Math.max(0, state.remainTimeSec - extra),
    };
}
