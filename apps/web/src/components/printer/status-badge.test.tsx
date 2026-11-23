import type { PrinterLiveState } from '@farolprint/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { m } from '@/lib/i18n';
import { StatusBadge } from './status-badge';

const state = (overrides: Partial<PrinterLiveState>) =>
    ({ connected: true, printState: 'standby', kobraState: 'free', ...overrides }) as PrinterLiveState;

describe('StatusBadge', () => {
    it('shows the state label', () => {
        render(<StatusBadge state={state({ kobraState: 'printing', printState: 'printing' })} />);
        expect(screen.getByText(/printing/i)).toBeTruthy();
    });

    it('falls back to the raw state when it is unknown', () => {
        render(<StatusBadge state={state({ kobraState: 'brand_new_state' })} />);
        expect(screen.getByText('brand_new_state')).toBeTruthy();
    });
});

describe('StatusBadge while calibrating', () => {
    it('says the printer is calibrating whatever the calibration step', () => {
        for (const kobraState of ['auto_leveling', 'vibrating', 'preheating', 'flow_calibrating']) {
            const { unmount } = render(<StatusBadge state={state({ kobraState, printState: 'printing' })} />);
            expect(screen.getByText(m.state_calibrating())).toBeTruthy();
            unmount();
        }
    });

    it('names a step that happens after the first layer instead of calling it calibration', () => {
        render(
            <StatusBadge state={state({ kobraState: 'filament_cutting', printState: 'printing', currLayer: 30 })} />,
        );
        expect(screen.getByText(m.state_filament_cutting())).toBeTruthy();
        expect(screen.queryByText(m.state_calibrating())).toBeNull();
    });
});
