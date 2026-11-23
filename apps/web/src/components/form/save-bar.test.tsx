import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { SaveBar } from './save-bar';

describe('SaveBar', () => {
    it('shows a quiet save button while nothing changed', () => {
        render(<SaveBar changed={false} extra={<span>extra</span>} />);
        expect(screen.getByRole('button', { name: m.common_save() })).toBeTruthy();
        expect(screen.queryByText(m.form_unsaved())).toBeNull();
        expect(screen.queryByRole('button', { name: m.form_discard() })).toBeNull();
        expect(screen.getByText('extra')).toBeTruthy();
    });

    it('stands out with discard and save once something changed', async () => {
        const onDiscard = vi.fn();
        const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
        render(
            <form onSubmit={onSubmit}>
                <SaveBar changed onDiscard={onDiscard} />
            </form>,
        );
        const bar = screen.getByRole('status');
        expect(bar.className).toContain('sticky');
        expect(bar.textContent).toContain(m.form_unsaved());
        await userEvent.click(screen.getByRole('button', { name: m.form_discard() }));
        expect(onDiscard).toHaveBeenCalledOnce();
        expect(onSubmit).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        expect(onSubmit).toHaveBeenCalledOnce();
    });

    it('disables the buttons while saving', () => {
        render(<SaveBar changed submitting onDiscard={vi.fn()} />);
        expect(screen.getByRole('button', { name: m.common_save() }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: m.form_discard() }).hasAttribute('disabled')).toBe(true);
    });
});
