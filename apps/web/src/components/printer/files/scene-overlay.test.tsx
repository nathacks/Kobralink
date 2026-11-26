import { type Printer, printerSettingsSchema } from '@kobralink/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { printersStore } from '@/stores/printers';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/api')>();
    return { ...actual, api: { ...actual.api, printers: { ...actual.api.printers, update: mocks.update } } };
});

const { SceneOverlay } = await import('./gcode-preview');

const printer = {
    id: 'p1',
    name: 'Kobra',
    settings: printerSettingsSchema.parse({}),
} as unknown as Printer;

function plateOf(id: string) {
    return printersStore.state.printers[id]?.settings.buildPlate;
}

async function choose(label: string) {
    render(
        <SceneOverlay
            printerId="p1"
            mode="solid"
            pan={false}
            onToggleMode={() => {}}
            onTogglePan={() => {}}
            onReset={() => {}}
        />,
    );
    await userEvent.click(screen.getByRole('button', { name: new RegExp(m.preview_plate()) }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: label }));
}

describe('SceneOverlay plate menu', () => {
    beforeEach(() => {
        mocks.update.mockReset();
        printersStore.actions.upsertPrinter(printer);
        printersStore.actions.upsertPrinter({ ...printer, id: 'p2' });
    });

    it('saves the chosen plate on this printer only', async () => {
        mocks.update.mockImplementation(async (_id: string, body: { settings: Partial<Printer['settings']> }) => ({
            ...printer,
            settings: { ...printer.settings, ...body.settings },
        }));
        expect(plateOf('p1')).toBe('anycubic');
        await choose(m.preview_plate_none());
        expect(mocks.update).toHaveBeenCalledWith('p1', { settings: { buildPlate: 'none' } });
        await waitFor(() => expect(plateOf('p1')).toBe('none'));
        expect(plateOf('p2')).toBe('anycubic');
    });

    it('goes back to the previous plate when saving fails', async () => {
        mocks.update.mockRejectedValue(new Error('forbidden'));
        await choose(m.preview_plate_pei());
        expect(mocks.update).toHaveBeenCalledOnce();
        await waitFor(() => expect(plateOf('p1')).toBe('anycubic'));
    });
});
