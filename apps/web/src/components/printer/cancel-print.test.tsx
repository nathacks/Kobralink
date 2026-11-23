import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { confirmCancel } from './cancel-print';

beforeEach(() => alertConfirmationDialogStore.actions.closeAlertDialog());

describe('confirmCancel', () => {
    it('asks before cancelling and sends no reason by default', async () => {
        const cancel = vi.fn().mockResolvedValue(undefined);
        confirmCancel(cancel);
        const dialog = alertConfirmationDialogStore.state;
        expect(dialog.isOpen).toBe(true);
        expect(dialog.title).toBe(m.print_cancel_title());
        expect(dialog.actionLabel).toBe(m.print_cancel_action());
        expect(cancel).not.toHaveBeenCalled();
        await dialog.onAction?.();
        expect(cancel).toHaveBeenCalledWith('');
    });

    it('sends the reason picked in the dialog', async () => {
        const cancel = vi.fn().mockResolvedValue(undefined);
        confirmCancel(cancel);
        render(<div>{alertConfirmationDialogStore.state.description}</div>);
        expect(screen.getByText(m.print_cancel_hint())).toBeTruthy();
        await userEvent.click(screen.getByRole('combobox', { name: m.print_cancel_reason() }));
        await userEvent.click(await screen.findByRole('option', { name: m.failure_reason_spaghetti() }));
        await alertConfirmationDialogStore.state.onAction?.();
        expect(cancel).toHaveBeenCalledWith('spaghetti');
        await userEvent.click(screen.getByRole('combobox', { name: m.print_cancel_reason() }));
        await userEvent.click(await screen.findByRole('option', { name: m.print_cancel_reason_none() }));
        await alertConfirmationDialogStore.state.onAction?.();
        expect(cancel).toHaveBeenLastCalledWith('');
    });
});
