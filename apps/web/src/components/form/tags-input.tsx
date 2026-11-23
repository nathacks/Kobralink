import { X } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { m } from '@/lib/i18n';

export function normalizeTag(raw: string): string {
    return raw.trim().toLowerCase().slice(0, 32);
}

export function TagsInput({
    id,
    value,
    onChange,
    max = 20,
}: {
    id?: string;
    value: string[];
    onChange: (tags: string[]) => void;
    max?: number;
}) {
    const [draft, setDraft] = useState('');
    const add = (raw: string) => {
        const tags = raw.split(',').map(normalizeTag).filter(Boolean);
        const next = [...value];
        for (const tag of tags) if (!next.includes(tag) && next.length < max) next.push(tag);
        if (next.length !== value.length) onChange(next);
        setDraft('');
    };
    return (
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-3xl border border-input px-2 py-1.5">
            {value.map((tag) => (
                <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-primary/15 py-0.5 pr-1 pl-2.5 text-xs font-medium text-primary-strong"
                >
                    {tag}
                    <button
                        type="button"
                        aria-label={m.tags_remove({ tag })}
                        onClick={() => onChange(value.filter((t) => t !== tag))}
                        className="flex size-4 items-center justify-center rounded-full hover:bg-primary/20"
                    >
                        <X className="size-3" />
                    </button>
                </span>
            ))}
            <Input
                id={id}
                value={draft}
                disabled={value.length >= max}
                placeholder={value.length ? '' : m.tags_add_placeholder()}
                onChange={(e) => {
                    if (e.target.value.includes(',')) add(e.target.value);
                    else setDraft(e.target.value);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        add(draft);
                    } else if (e.key === 'Backspace' && !draft && value.length) {
                        onChange(value.slice(0, -1));
                    }
                }}
                onBlur={() => draft && add(draft)}
                className="h-7 min-w-32 flex-1 border-0 px-1.5 shadow-none focus-visible:ring-0"
            />
        </div>
    );
}
