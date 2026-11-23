import type { AmsSlot } from '@kobralink/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { m } from '@/lib/i18n';
import { SlotDetails } from './slot-form';

const slot = (extra: Partial<AmsSlot>): AmsSlot => ({
    globalIndex: 0,
    boxId: 0,
    index: 0,
    status: 5,
    type: 'PLA',
    color: [255, 0, 0],
    activity: '',
    ...extra,
});

describe('SlotDetails', () => {
    it('shows where the filament came from and how much is left', () => {
        render(<SlotDetails slot={slot({ source: 'rfid', remainingPct: 20 })} />);
        expect(screen.getByText(m.ace_slot_source_rfid())).toBeTruthy();
        expect(screen.getByText(m.ace_slot_remaining({ pct: 20 }))).toBeTruthy();
    });

    it('names a slot status other than ready', () => {
        render(<SlotDetails slot={slot({ status: 8 })} />);
        expect(screen.getByText(m.ace_slot_status_reading_rfid())).toBeTruthy();
    });

    it('draws the colours of a multicolour spool', () => {
        render(
            <SlotDetails
                slot={slot({
                    colors: [
                        [255, 0, 0],
                        [0, 0, 255],
                    ],
                })}
            />,
        );
        const swatch = screen.getByRole('img', { name: m.ace_slot_colors({ count: 2 }) });
        expect(swatch.getAttribute('style')).toContain('linear-gradient');
    });

    it('shows nothing for a plain ready slot or the toolhead', () => {
        const { container } = render(<SlotDetails slot={slot({})} />);
        expect(container.textContent).toBe('');
        const toolhead = render(<SlotDetails slot={slot({ boxId: -1, status: 8 })} />);
        expect(toolhead.container.textContent).toBe('');
    });
});
