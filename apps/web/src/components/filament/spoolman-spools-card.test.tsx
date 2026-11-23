import type { SpoolmanSpool } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { SpoolmanSpoolsCard } from './spoolman-spools-card';

const mocks = vi.hoisted(() => ({ spools: vi.fn(), health: vi.fn() }));

vi.mock('@/lib/api', () => ({
    api: new Proxy({ spoolman: { spools: mocks.spools, health: mocks.health } } as Record<string, unknown>, {
        get: (t, k: string) => t[k] ?? new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
    }),
}));

const spools: SpoolmanSpool[] = [
    {
        id: 4,
        remaining_weight: 820.4,
        used_weight: 180,
        location: 'Shelf A',
        filament: { id: 1, name: 'PETG Black', material: 'PETG', color_hex: '111111', vendor: { id: 1, name: 'eSun' } },
    },
    { id: 9, filament: { id: 2, material: 'PLA' } },
];

beforeEach(() => {
    mocks.spools.mockReset().mockResolvedValue(spools);
    mocks.health.mockReset().mockResolvedValue({ reachable: true, configured: true, pending: 0 });
});

describe('SpoolmanSpoolsCard', () => {
    it('lists the spools with what is left and links to Spoolman', async () => {
        await renderWithProviders(<SpoolmanSpoolsCard serverUrl="http://spoolman.local:7912" />);
        expect(await screen.findByText('#4 · eSun PETG Black')).toBeTruthy();
        expect(screen.getByText(`PETG · ${m.spoolman_spool_left({ remaining: 820 })} · Shelf A`)).toBeTruthy();
        expect(screen.getByText('#9 · PLA')).toBeTruthy();
        expect(screen.getByRole('link', { name: m.spoolman_open() }).getAttribute('href')).toBe(
            'http://spoolman.local:7912',
        );
    });

    it('tells when usage reports are waiting for Spoolman', async () => {
        mocks.health.mockResolvedValue({ reachable: false, configured: true, pending: 3 });
        await renderWithProviders(<SpoolmanSpoolsCard serverUrl="http://spoolman.local:7912" />);
        expect(await screen.findByText(m.spoolman_pending({ n: 3 }))).toBeTruthy();
    });

    it('says when Spoolman cannot be reached or has no spool', async () => {
        mocks.spools.mockRejectedValueOnce(new Error('down'));
        const first = await renderWithProviders(<SpoolmanSpoolsCard serverUrl="http://x" />);
        expect(await screen.findByText(m.spoolman_unreachable())).toBeTruthy();
        first.unmount();
        mocks.spools.mockResolvedValue([]);
        await renderWithProviders(<SpoolmanSpoolsCard serverUrl="http://x" />);
        expect(await screen.findByText(m.spools_empty())).toBeTruthy();
    });
});
