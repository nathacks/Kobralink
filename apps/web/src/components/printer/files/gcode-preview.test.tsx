import { type AmsSlot, type GcodeFileDto, printerSettingsSchema } from '@kobralink/shared';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedGcode } from '@/lib/gcode-parser.worker';

const scene = vi.hoisted(() => ({ palette: [] as string[] }));
const printer = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./gcode-scene', () => ({
    GcodeScene: ({ palette }: { palette: string[] }) => {
        scene.palette = palette;
        return null;
    },
}));
vi.mock('@/components/printer/files/cost-estimate', () => ({ CostEstimateCard: () => null }));
vi.mock('@/hooks/use-cost-estimate', () => ({ useCostEstimate: () => ({ estimate: () => null, currency: 'EUR' }) }));
vi.mock('@/hooks/use-printers', async () => {
    const { useSyncExternalStore } = await import('react');
    const listeners = new Set<() => void>();
    (printer as { notify?: () => void }).notify = () => {
        for (const l of listeners) l();
    };
    return {
        usePrinter: (_id: string, select: (p: unknown) => unknown) =>
            select(
                useSyncExternalStore(
                    (l) => {
                        listeners.add(l);
                        return () => listeners.delete(l);
                    },
                    () => printer.current,
                ),
            ),
    };
});

const data: ParsedGcode = {
    layers: [{ z: 0.2, segs: Float32Array.from([0, 0, 10, 0, 1, 0]) }],
    minX: 0,
    maxX: 10,
    minY: 0,
    maxY: 10,
};
vi.mock('@/hooks/use-parsed-gcode', () => ({ useParsedGcode: () => ({ kind: 'ready', data }) }));

const { GcodePreview } = await import('./gcode-preview');

function slot(globalIndex: number, boxId: number, index: number, color: AmsSlot['color']): AmsSlot {
    return { globalIndex, boxId, index, status: 5, type: 'PLA', color, activity: '' };
}

const file = {
    id: 'f',
    filename: 'Benchy.gcode',
    filaments: [{ slotIndex: 0, colorHex: '#F05A3C', material: 'PLA', isUsed: true }],
} as unknown as GcodeFileDto;

function setLive(x: number, printSlots: { filename: string; slots: number[] } | null = null) {
    printer.current = {
        modeId: '20028',
        settings: printerSettingsSchema.parse({}),
        live: {
            filename: 'Benchy.gcode',
            printState: 'printing',
            currLayer: 1,
            position: { x, y: 0, z: 0.2 },
            printSlots,
            amsSlots: [slot(0, -1, 0, [20, 20, 20]), slot(3, 0, 0, [240, 90, 60])],
            amsLoadedSlot: 3,
            filamentMode: 'ace_hub',
            fanSpeed: 0,
        },
    };
    act(() => (printer as unknown as { notify: () => void }).notify());
}

describe('GcodePreview colours', () => {
    beforeEach(() => {
        scene.palette = [];
    });

    it('learns the slot the nozzle really prints with', async () => {
        setLive(2);
        render(<GcodePreview printerId="p" file={file} />);
        await waitFor(() => expect(scene.palette).toEqual(['#141414']));
        setLive(4);
        setLive(6);
        await waitFor(() => expect(scene.palette).toEqual(['#f05a3c']));
    });

    it('uses the slots Kobralink sent when it started the print', async () => {
        setLive(2, { filename: 'Benchy.gcode', slots: [3] });
        render(<GcodePreview printerId="p" file={file} />);
        await waitFor(() => expect(scene.palette).toEqual(['#f05a3c']));
    });
});
