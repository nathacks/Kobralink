import type { QueueItemDto } from '@kobralink/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PrinterWithLive } from '@/lib/api';
import { m } from '@/lib/i18n';
import { moveInOrder, QueueItemRow, targetLabel, WAIT_LABEL } from './queue-item-row';

const printers = [{ id: 'p1', name: 'Kobra 4' }] as PrinterWithLive[];

const item: QueueItemDto = {
    id: 'q1',
    printerId: null,
    targetTags: [],
    fileId: 'f1',
    filename: 'bracket.gcode',
    thumbnail: null,
    estPrintTimeSec: 600,
    position: 1,
    excludedObjects: [],
    options: {},
    createdAt: '2026-10-01T00:00:00.000Z',
    waiting: null,
    candidates: ['p1'],
};

describe('targetLabel', () => {
    it('names the printer, the tags or any printer', () => {
        expect(targetLabel({ printerId: 'p1', targetTags: [] }, printers)).toBe('Kobra 4');
        expect(targetLabel({ printerId: 'gone', targetTags: [] }, printers)).toBe('gone');
        expect(targetLabel({ printerId: null, targetTags: ['pla', 'lab'] }, printers)).toBe(
            m.queue_target_tags({ tags: 'pla, lab' }),
        );
        expect(targetLabel({ printerId: null, targetTags: [] }, printers)).toBe(m.queue_target_any());
    });
});

describe('moveInOrder', () => {
    it('swaps an item with its neighbour', () => {
        expect(moveInOrder(['a', 'b', 'c'], 'b', 'a')).toEqual(['b', 'a', 'c']);
        expect(moveInOrder(['a', 'b', 'c'], 'b', 'c')).toEqual(['a', 'c', 'b']);
    });

    it('keeps the order when an id is unknown', () => {
        expect(moveInOrder(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
    });
});

describe('QueueItemRow', () => {
    function renderRow(over: Partial<QueueItemDto> = {}, edges = { first: false, last: false }) {
        const handlers = { onUp: vi.fn(), onDown: vi.fn(), onRemove: vi.fn() };
        render(
            <ul>
                <QueueItemRow item={{ ...item, ...over }} printers={printers} {...edges} {...handlers} />
            </ul>,
        );
        return handlers;
    }

    it('shows the file, its target, the excluded objects and why it waits', () => {
        renderRow({ waiting: 'filament', excludedObjects: ['a', 'b'] });
        expect(screen.getByText('bracket.gcode')).toBeTruthy();
        expect(screen.getByText(`· ${m.queue_target_any()}`)).toBeTruthy();
        expect(screen.getByText(`· ${m.queue_excluded({ n: 2 })}`)).toBeTruthy();
        expect(screen.getByText(WAIT_LABEL.filament())).toBeTruthy();
    });

    it('hides the wait badge when the item can start', () => {
        renderRow();
        for (const label of Object.values(WAIT_LABEL)) expect(screen.queryByText(label())).toBeNull();
    });

    it('moves and removes the item', async () => {
        const handlers = renderRow();
        await userEvent.click(screen.getByRole('button', { name: m.queue_move_up() }));
        await userEvent.click(screen.getByRole('button', { name: m.queue_move_down() }));
        await userEvent.click(screen.getByRole('button', { name: m.common_delete() }));
        expect(handlers.onUp).toHaveBeenCalledOnce();
        expect(handlers.onDown).toHaveBeenCalledOnce();
        expect(handlers.onRemove).toHaveBeenCalledOnce();
    });

    it('disables moving past the ends', () => {
        renderRow({}, { first: true, last: true });
        expect(screen.getByRole('button', { name: m.queue_move_up() }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: m.queue_move_down() }).hasAttribute('disabled')).toBe(true);
    });
});
