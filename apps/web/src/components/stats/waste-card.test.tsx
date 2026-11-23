import type { StatsWaste } from '@kobralink/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { renderWithProviders } from '@/test/render';
import { formatWeight, WasteCard } from './waste-card';

const none = { jobs: 0, filamentMm: 0, weightG: 0, filamentCost: 0 };

const waste: StatsWaste = {
    paused: { jobs: 1, filamentMm: 30000, weightG: 90, filamentCost: 1.8 },
    cancelled: { jobs: 3, filamentMm: 10000, weightG: 30, filamentCost: 0.6 },
};

describe('formatWeight', () => {
    it('uses grams below a kilogram and kilograms above', () => {
        expect(formatWeight(0)).toBe('0 g');
        expect(formatWeight(12.4)).toBe('12 g');
        expect(formatWeight(999)).toBe('999 g');
        expect(formatWeight(1250)).toBe('1.25 kg');
    });
});

describe('WasteCard', () => {
    it('shows the total, its share of the filament and its cost', async () => {
        await renderWithProviders(<WasteCard waste={waste} totalFilamentG={480} currency="EUR" />);
        expect(screen.getByText(m.stats_waste_title())).toBeTruthy();
        expect(screen.getByText('120 g')).toBeTruthy();
        expect(screen.getByText(`${m.stats_waste_share({ pct: 25 })} · ${formatMoney(2.4, 'EUR')}`)).toBeTruthy();
    });

    it('splits paused and cancelled prints with their counts, weight and cost', async () => {
        await renderWithProviders(<WasteCard waste={waste} totalFilamentG={480} currency="EUR" />);
        expect(screen.getByText(m.stats_waste_paused())).toBeTruthy();
        expect(screen.getByText(m.stats_waste_paused_hint())).toBeTruthy();
        expect(
            screen.getByText(`${m.stats_waste_entry({ n: 1, weight: '90 g' })} · ${formatMoney(1.8, 'EUR')}`),
        ).toBeTruthy();
        expect(screen.getByText(m.stats_waste_cancelled())).toBeTruthy();
        expect(
            screen.getByText(`${m.stats_waste_entry({ n: 3, weight: '30 g' })} · ${formatMoney(0.6, 'EUR')}`),
        ).toBeTruthy();
    });

    it('sizes each bar by its share of the waste', async () => {
        const { container } = await renderWithProviders(
            <WasteCard waste={waste} totalFilamentG={480} currency="EUR" />,
        );
        const bars = [...container.querySelectorAll<HTMLElement>('[role="presentation"]')].map((b) => b.style.width);
        expect(bars).toEqual(['75%', '25%']);
    });

    it('leaves the cost out when the filament has no price', async () => {
        await renderWithProviders(
            <WasteCard
                waste={{ paused: { ...waste.paused, filamentCost: 0 }, cancelled: none }}
                totalFilamentG={0}
                currency="EUR"
            />,
        );
        expect(screen.getByText(m.stats_waste_share({ pct: 0 }))).toBeTruthy();
        expect(screen.getByText(m.stats_waste_entry({ n: 1, weight: '90 g' }))).toBeTruthy();
        expect(screen.getByText(m.stats_waste_entry({ n: 0, weight: '0 g' }))).toBeTruthy();
    });

    it('says so when every print finished', async () => {
        await renderWithProviders(
            <WasteCard waste={{ paused: none, cancelled: none }} totalFilamentG={480} currency="EUR" />,
        );
        expect(screen.getByText(m.stats_waste_none())).toBeTruthy();
        expect(screen.queryByText(m.stats_waste_paused())).toBeNull();
    });
});
