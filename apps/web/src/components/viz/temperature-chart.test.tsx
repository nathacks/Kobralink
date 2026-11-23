import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TemperatureChart, temperatureCeiling } from './temperature-chart';

const point = (t: number, nozzle: number, bed: number) => ({ t, nozzle, bed });

describe('temperatureCeiling', () => {
    it('keeps at least one 50 °C step for a cold printer', () => {
        expect(temperatureCeiling([point(1, 24, 23)], [0, 0])).toBe(50);
        expect(temperatureCeiling([], [])).toBe(50);
    });

    it('leaves headroom above the hottest reading or target', () => {
        expect(temperatureCeiling([point(1, 36, 35)], [0, 0])).toBe(50);
        expect(temperatureCeiling([point(1, 45, 35)], [0, 0])).toBe(100);
        expect(temperatureCeiling([point(1, 30, 30)], [210, 60])).toBe(250);
        expect(temperatureCeiling([point(1, 252, 95)], [250, 95])).toBe(300);
    });
});

describe('TemperatureChart', () => {
    it('renders a chart container', () => {
        const { container } = render(
            <TemperatureChart
                data={[point(1, 30, 30), point(2, 40, 35)]}
                series={[
                    { key: 'nozzle', label: 'Nozzle', color: 'red', target: 210 },
                    { key: 'bed', label: 'Bed', color: 'blue', target: 0 },
                ]}
            />,
        );
        expect(container.querySelector('[data-slot="chart"]')).toBeTruthy();
    });
});
