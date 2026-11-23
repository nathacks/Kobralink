import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, IconButton, Panel, Segmented } from './panel';

describe('Panel', () => {
    it('renders the title, description, action and body', () => {
        render(
            <Panel title="Queue" description="3 files" action={<button type="button">Clear</button>} className="x-test">
                <p>body</p>
            </Panel>,
        );
        expect(screen.getByRole('heading', { name: 'Queue' })).toBeTruthy();
        expect(screen.getByText('3 files')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
        expect(screen.getByText('body').closest('section')?.className).toContain('x-test');
    });

    it('omits the header without title nor action', () => {
        const { container } = render(<Panel>body</Panel>);
        expect(container.querySelector('header')).toBeNull();
    });
});

describe('Segmented', () => {
    it('marks the selected option and reports clicks', async () => {
        const onSelect = vi.fn();
        render(
            <Segmented
                label="Step"
                options={[
                    { value: 1, label: '1 mm' },
                    { value: 10, label: '10 mm' },
                ]}
                value={10}
                onSelect={onSelect}
            />,
        );
        expect(screen.getByRole('group', { name: 'Step' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '10 mm' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: '1 mm' }).getAttribute('aria-pressed')).toBe('false');
        await userEvent.click(screen.getByRole('button', { name: '1 mm' }));
        expect(onSelect).toHaveBeenCalledWith(1);
    });

    it('acts as a button bar without a value and can be disabled', async () => {
        const onSelect = vi.fn();
        render(<Segmented options={[{ value: 'pla', label: 'PLA' }]} onSelect={onSelect} disabled />);
        const pla = screen.getByRole('button', { name: 'PLA' });
        expect(pla.hasAttribute('aria-pressed')).toBe(false);
        expect(pla.hasAttribute('disabled')).toBe(true);
        await userEvent.click(pla);
        expect(onSelect).not.toHaveBeenCalled();
    });
});

describe('IconButton and EmptyState', () => {
    it('labels the icon button with its title', async () => {
        const onClick = vi.fn();
        render(
            <IconButton title="Add" onClick={onClick}>
                +
            </IconButton>,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(onClick).toHaveBeenCalled();
    });

    it('renders the empty state text', () => {
        render(<EmptyState icon={<svg aria-hidden />}>Nothing yet</EmptyState>);
        expect(screen.getByText('Nothing yet')).toBeTruthy();
    });
});
