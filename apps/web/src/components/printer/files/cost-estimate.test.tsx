import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/format';
import { m } from '@/lib/i18n';
import { CostEstimateCard } from './cost-estimate';

const estimate = { filament: 1.5, energy: 0.2, total: 1.7, weightG: 30.4, unpricedG: 0 };

describe('CostEstimateCard', () => {
    it('breaks the estimate down into filament with its weight, energy and total', () => {
        render(<CostEstimateCard estimate={estimate} currency="BRL" />);
        const card = screen.getByRole('region', { name: m.cost_estimate() });
        expect(screen.getByText(`${m.history_cost_filament()} · 30 g`)).toBeTruthy();
        expect(screen.getByText(formatMoney(1.5, 'BRL'))).toBeTruthy();
        expect(screen.getByText(formatMoney(0.2, 'BRL'))).toBeTruthy();
        expect(screen.getByText(`≈ ${formatMoney(1.7, 'BRL')}`)).toBeTruthy();
        expect(card.textContent).not.toContain(m.cost_estimate_unpriced({ g: 0 }));
    });

    it('mentions the filament it could not price', () => {
        render(<CostEstimateCard estimate={{ ...estimate, unpricedG: 12.4 }} currency="BRL" />);
        expect(screen.getByText(m.cost_estimate_unpriced({ g: 12 }))).toBeTruthy();
    });

    it('renders nothing without an estimate', () => {
        const { container } = render(<CostEstimateCard estimate={null} currency="BRL" />);
        expect(container.innerHTML).toBe('');
    });
});
