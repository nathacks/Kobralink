import { type PrinterProfile, printerProfileSchema } from '@kobralink/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { nozzleChoices, ProfileFields } from './profile-fields';

const empty = printerProfileSchema.parse({});

function Harness({ initial = empty, onChange }: { initial?: PrinterProfile; onChange: (p: PrinterProfile) => void }) {
    const [value, setValue] = useState(initial);
    return (
        <ProfileFields
            value={value}
            modeId="20028"
            onChange={(next) => {
                setValue(next);
                onChange(next);
            }}
        />
    );
}

describe('nozzleChoices', () => {
    it('offers the official nozzle sizes of the model', () => {
        expect(nozzleChoices('20028', null)).toEqual([0.25, 0.4, 0.6, 0.8]);
        expect(nozzleChoices('20024', null)).toEqual([0.4, 0.6, 0.8]);
    });

    it('falls back to common sizes for an unknown model and keeps the current one', () => {
        expect(nozzleChoices('99999', null)).toContain(0.2);
        expect(nozzleChoices('20024', 1.2)).toEqual([0.4, 0.6, 0.8, 1.2]);
    });
});

describe('ProfileFields', () => {
    it('edits the text fields and the tags', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await userEvent.type(screen.getByLabelText(m.profile_location()), 'Garage');
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ location: 'Garage' }));
        await userEvent.type(screen.getByLabelText(m.profile_tags()), 'petg{Enter}');
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tags: ['petg'] }));
    });

    it('stores numbers and clears them back to empty', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const power = screen.getByLabelText(m.profile_power());
        fireEvent.change(power, { target: { value: '180' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ powerW: 180 }));
        fireEvent.change(power, { target: { value: '' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ powerW: null }));
    });

    it('has no purchase price or lifespan field', () => {
        render(<Harness onChange={vi.fn()} />);
        expect(screen.getAllByRole('spinbutton')).toHaveLength(4);
    });

    it('overrides one axis of the model volume and clears back to the model', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        const z = screen.getByLabelText('Z');
        expect(z.getAttribute('placeholder')).toBe('260');
        fireEvent.change(z, { target: { value: '250' } });
        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ buildVolumeMm: { x: 260, y: 260, z: 250 } }),
        );
        fireEvent.change(z, { target: { value: '' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ buildVolumeMm: null }));
    });

    it('shows the nozzle as not set until one is chosen', () => {
        render(<Harness onChange={vi.fn()} />);
        expect(screen.getByRole('combobox', { name: m.profile_nozzle() }).textContent).toContain(
            m.profile_nozzle_unknown(),
        );
    });

    it('chooses a nozzle among the official sizes', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await userEvent.click(screen.getByRole('combobox', { name: m.profile_nozzle() }));
        await userEvent.click(await screen.findByRole('option', { name: '0.6 mm' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ nozzleMm: 0.6 }));
    });
});
