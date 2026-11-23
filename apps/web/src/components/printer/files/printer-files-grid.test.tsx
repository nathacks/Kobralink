import type { PrinterFileListDto } from '@farolprint/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';
import { renderWithProviders } from '@/test/render';
import { PrinterFilesGrid } from './printer-files-grid';

const { list, print, thumbnail, toast } = vi.hoisted(() => ({
    list: vi.fn(),
    print: vi.fn(),
    thumbnail: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api', () => ({
    api: new Proxy({ printerFiles: { list, print, thumbnail, remove: vi.fn() } } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));

const listing = (overrides: Partial<PrinterFileListDto> = {}): PrinterFileListDto => ({
    files: [{ filename: 'bracket_PLA_0.2_1h.gcode', sizeBytes: 2048, timestamp: 1_790_000_000, folder: null }],
    testModels: [
        { filename: 'Shark_plate(01)_PLA_0.2_48m26s.gcode', sizeBytes: 2_524_965, timestamp: 0, folder: 'test_model' },
    ],
    truncated: false,
    ...overrides,
});

beforeEach(() => {
    alertConfirmationDialogStore.actions.closeAlertDialog();
    list.mockReset().mockResolvedValue(listing());
    print.mockReset().mockResolvedValue(undefined);
    thumbnail.mockReset().mockResolvedValue({ thumbnail: '' });
});

const grid = (search = '') =>
    renderWithProviders(<PrinterFilesGrid printerId="p1" connected canPrint search={search} />);

describe('PrinterFilesGrid', () => {
    it('lists the printer files and the test models apart', async () => {
        await grid();
        expect(await screen.findByRole('heading', { name: 'bracket' })).toBeTruthy();
        const models = screen.getByRole('region', { name: m.pfiles_test_models() });
        expect(within(models).getByRole('heading', { name: 'Shark' })).toBeTruthy();
        expect(within(models).getByText(m.pfiles_test_models_hint())).toBeTruthy();
    });

    it('offers no selection or delete on a test model', async () => {
        await grid();
        const models = await screen.findByRole('region', { name: m.pfiles_test_models() });
        expect(within(models).queryByRole('button', { name: m.pfiles_select() })).toBeNull();
        expect(screen.getAllByRole('button', { name: m.pfiles_select() })).toHaveLength(1);
        await userEvent.click(within(models).getByRole('button', { name: m.files_actions() }));
        expect(await screen.findByRole('menuitem', { name: m.files_preview() })).toBeTruthy();
        expect(screen.queryByRole('menuitem', { name: m.common_delete() })).toBeNull();
    });

    it('prints a test model with its folder', async () => {
        await grid();
        const models = await screen.findByRole('region', { name: m.pfiles_test_models() });
        await userEvent.click(within(models).getByRole('button', { name: `${m.pfiles_print_from_printer()}: Shark` }));
        const dialog = alertConfirmationDialogStore.state;
        expect(dialog.isOpen).toBe(true);
        await dialog.onAction?.();
        expect(print).toHaveBeenCalledWith('p1', {
            filename: 'test_model/Shark_plate(01)_PLA_0.2_48m26s.gcode',
            sizeBytes: 2_524_965,
        });
    });

    it('asks for a test model preview with its folder', async () => {
        await grid();
        await screen.findByRole('region', { name: m.pfiles_test_models() });
        expect(thumbnail).toHaveBeenCalledWith('p1', 'test_model/Shark_plate(01)_PLA_0.2_48m26s.gcode');
        expect(thumbnail).toHaveBeenCalledWith('p1', 'bracket_PLA_0.2_1h.gcode');
    });

    it('says when the printer listed only its newest files', async () => {
        list.mockResolvedValue(listing({ truncated: true }));
        await grid();
        expect(await screen.findByText(m.pfiles_truncated({ count: 256 }))).toBeTruthy();
    });

    it('says nothing about a limit for a shorter list', async () => {
        await grid();
        await screen.findByRole('heading', { name: 'bracket' });
        expect(screen.queryByText(m.pfiles_truncated({ count: 256 }))).toBeNull();
    });

    it('filters the test models with the search', async () => {
        await grid('bracket');
        await screen.findByRole('heading', { name: 'bracket' });
        expect(screen.queryByRole('region', { name: m.pfiles_test_models() })).toBeNull();
    });

    it('hides the section when the printer has no test models', async () => {
        list.mockResolvedValue(listing({ testModels: [] }));
        await grid();
        await screen.findByRole('heading', { name: 'bracket' });
        expect(screen.queryByRole('region', { name: m.pfiles_test_models() })).toBeNull();
    });
});
