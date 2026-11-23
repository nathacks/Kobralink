import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { normalizeTag, TagsInput } from './tags-input';

function Harness({
    initial = [],
    max,
    onChange,
}: {
    initial?: string[];
    max?: number;
    onChange?: (t: string[]) => void;
}) {
    const [tags, setTags] = useState(initial);
    return (
        <TagsInput
            id="tags"
            value={tags}
            max={max}
            onChange={(next) => {
                setTags(next);
                onChange?.(next);
            }}
        />
    );
}

const input = () => screen.getByRole('textbox') as HTMLInputElement;

describe('normalizeTag', () => {
    it('trims, lowercases and caps the length', () => {
        expect(normalizeTag('  Farm-A ')).toBe('farm-a');
        expect(normalizeTag('x'.repeat(40))).toHaveLength(32);
    });
});

describe('TagsInput', () => {
    it('adds a tag on Enter, normalised', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await userEvent.type(input(), ' PETG {Enter}');
        expect(onChange).toHaveBeenLastCalledWith(['petg']);
        expect(screen.getByText('petg')).toBeTruthy();
        expect(input().value).toBe('');
    });

    it('adds several tags from a comma list and ignores duplicates and blanks', async () => {
        const onChange = vi.fn();
        render(<Harness initial={['pla']} onChange={onChange} />);
        fireEvent.change(input(), { target: { value: 'PLA, garage, ,shelf-2,' } });
        expect(onChange).toHaveBeenLastCalledWith(['pla', 'garage', 'shelf-2']);
    });

    it('removes a tag with its button and the last one with Backspace', async () => {
        const onChange = vi.fn();
        render(<Harness initial={['a', 'b', 'c']} onChange={onChange} />);
        await userEvent.click(screen.getByRole('button', { name: m.tags_remove({ tag: 'b' }) }));
        expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
        await userEvent.type(input(), '{Backspace}');
        expect(onChange).toHaveBeenLastCalledWith(['a']);
    });

    it('adds the draft when leaving the field', async () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);
        await userEvent.type(input(), 'kitchen');
        fireEvent.blur(input());
        expect(onChange).toHaveBeenLastCalledWith(['kitchen']);
    });

    it('stops at the maximum number of tags', async () => {
        const onChange = vi.fn();
        render(<Harness initial={['a']} max={2} onChange={onChange} />);
        fireEvent.change(input(), { target: { value: 'b,c,' } });
        expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
        expect(input().disabled).toBe(true);
    });
});
