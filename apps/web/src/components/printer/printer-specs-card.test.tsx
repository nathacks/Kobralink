import { printerSpecs } from '@kobralink/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { m } from '@/lib/i18n';
import { PrinterSpecsCard, specRows } from './printer-specs-card';

describe('specRows', () => {
    it('describes a model rated per mains voltage', () => {
        const spec = printerSpecs('20028');
        if (!spec) throw new Error('missing Kobra 4');
        const rows = Object.fromEntries(specRows(spec).map((r) => [r.label, r.value]));
        expect(rows[m.specs_volume()]).toBe('260 × 260 × 260 mm');
        expect(rows[m.specs_nozzles()]).toBe(m.specs_nozzles_value({ standard: 0.4, others: '0.25 / 0.6 / 0.8' }));
        expect(rows[m.specs_temps()]).toBe(m.specs_temps_value({ nozzle: 300, bed: 100 }));
        expect(rows[m.specs_power()]).toBe(m.specs_power_mains({ v110: 475, v220: 1450 }));
        expect(rows[m.specs_ace()]).toBe(m.specs_ace_optional());
    });

    it('describes a model with a single rated power and leaves unknown values out', () => {
        const k3 = printerSpecs('20024');
        const v2 = printerSpecs('20027');
        if (!k3 || !v2) throw new Error('missing Kobra 3');
        expect(specRows(k3).find((r) => r.label === m.specs_power())?.value).toBe('400 W');
        expect(specRows(v2).map((r) => r.label)).not.toContain(m.specs_power());
    });
});

describe('PrinterSpecsCard', () => {
    it('lists the specifications with links to the official sources', () => {
        render(<PrinterSpecsCard modeId="20030" />);
        expect(screen.getByText(m.specs_hint({ model: 'Kobra X' }))).toBeTruthy();
        expect(screen.getByText(m.specs_ace_builtin())).toBeTruthy();
        const links = screen.getAllByRole('link');
        expect(links.map((a) => a.getAttribute('href'))).toEqual(printerSpecs('20030')?.sources);
        expect(links.every((a) => a.getAttribute('target') === '_blank')).toBe(true);
    });

    it('says when Anycubic publishes nothing for the model', () => {
        render(<PrinterSpecsCard modeId="12345" />);
        expect(screen.getByText(m.specs_unknown({ modeId: '12345' }))).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
    });
});
