import type { GcodeFileDto } from '@farolprint/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileTile } from './file-tile';

const file = {
    id: 'f1',
    filename: '20261022-173630-5U+Lab+Rax+X2D_plate(03)_PETG_0.2_2h3m.gcode',
    sizeBytes: 3_500_000,
    estPrintTimeSec: 7380,
    thumbnail: '',
    filaments: [{ slotIndex: 0, material: 'PETG', colorHex: '#26a69a', isUsed: true }],
    webUnverified: false,
    lastJob: null,
} as unknown as GcodeFileDto;

function renderTile(overrides: Partial<Parameters<typeof FileTile>[0]> = {}) {
    const props = {
        file,
        printerId: 'p1',
        highlight: false,
        canPrint: true,
        onPrint: vi.fn(),
        onDelete: vi.fn(),
        onQueue: vi.fn(),
        onPreview: vi.fn(),
        ...overrides,
    };
    render(<FileTile {...props} />);
    return props;
}

describe('FileTile', () => {
    it('shows the readable part name and its plate', () => {
        renderTile();
        expect(screen.getByRole('heading', { name: '5U Lab Rax X2D' })).toBeTruthy();
        expect(screen.getByText('Plate 3')).toBeTruthy();
    });

    it('keeps the full filename as a tooltip', () => {
        renderTile();
        expect(screen.getByRole('heading').getAttribute('title')).toBe(file.filename);
    });

    it('opens the preview from the thumbnail', async () => {
        const props = renderTile();
        await userEvent.click(screen.getByRole('button', { name: /preview: 5U Lab Rax X2D/i }));
        expect(props.onPreview).toHaveBeenCalledOnce();
    });

    it('labels the actions menu and the print button', () => {
        renderTile();
        expect(screen.getByRole('button', { name: 'File actions' })).toBeTruthy();
        expect(screen.getByRole('button', { name: /print: 5U Lab Rax X2D/i })).toBeTruthy();
    });

    it('disables printing when the printer cannot print', async () => {
        const props = renderTile({ canPrint: false });
        const print = screen.getByRole('button', { name: /print: 5U Lab Rax X2D/i }) as HTMLButtonElement;
        expect(print.disabled).toBe(true);
        await userEvent.click(print);
        expect(props.onPrint).not.toHaveBeenCalled();
    });

    it('shows the estimated cost next to the print time', () => {
        renderTile({ estimatedCost: 'R$ 1,23' });
        const cost = screen.getByTitle('Estimated cost: R$ 1,23');
        expect(cost.textContent).toContain('≈ R$ 1,23');
    });

    it('shows no cost without an estimate', () => {
        renderTile();
        expect(screen.queryByText(/≈/)).toBeNull();
    });
});
