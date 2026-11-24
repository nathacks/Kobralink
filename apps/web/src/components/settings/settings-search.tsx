import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { usePrinterList } from '@/hooks/use-printers';
import { useIsAdmin } from '@/hooks/use-role';
import { m } from '@/lib/i18n';
import { appSettingsQuery } from '@/lib/queries';
import { revealSetting } from '@/lib/reveal-setting';
import { cn } from '@/lib/utils';
import { type SettingHit, searchSettings, settingHits } from './settings-index';

export function SettingsSearch() {
    const listId = useId();
    const navigate = useNavigate();
    const settings = useQuery(appSettingsQuery).data;
    const printers = usePrinterList();
    const isAdmin = useIsAdmin();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const shown = open && settings !== undefined && query.trim() !== '';
    const hits = shown ? searchSettings(settingHits(settings, printers, isAdmin), query) : [];

    const choose = async (hit: SettingHit) => {
        setOpen(false);
        setQuery('');
        await navigate({
            to: hit.to,
            params: hit.printerId ? { printerId: hit.printerId } : {},
            resetScroll: hit.card === undefined,
        });
        if (hit.card !== undefined) await revealSetting(hit.card, hit.label);
    };

    const move = (index: number) => {
        setActive(index);
        document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: 'nearest' });
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape') setOpen(false);
        if (hits.length === 0) return;
        if (e.key === 'ArrowDown') move((active + 1) % hits.length);
        else if (e.key === 'ArrowUp') move((active - 1 + hits.length) % hits.length);
        else if (e.key === 'Enter') void choose(hits[active]);
        else return;
        e.preventDefault();
    };

    return (
        <div className="relative w-full sm:w-80">
            <label className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm focus-within:ring-[3px] focus-within:ring-ring/50">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                    role="combobox"
                    aria-label={m.settings_search()}
                    aria-expanded={shown}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={hits.length > 0 ? `${listId}-${active}` : undefined}
                    autoComplete="off"
                    value={query}
                    placeholder={m.settings_search()}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onKeyDown={onKeyDown}
                    className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
                />
            </label>
            {shown && (
                <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-3xl border bg-popover text-popover-foreground shadow-lg">
                    {hits.length === 0 && (
                        <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
                            {m.settings_search_empty()}
                        </p>
                    )}
                    <div
                        id={listId}
                        role="listbox"
                        aria-label={m.settings_search()}
                        className={cn('max-h-80 overflow-y-auto p-2', hits.length === 0 && 'hidden')}
                    >
                        {hits.map((hit, i) => (
                            <button
                                key={hit.id}
                                id={`${listId}-${i}`}
                                type="button"
                                role="option"
                                tabIndex={-1}
                                aria-selected={i === active}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseMove={() => setActive(i)}
                                onClick={() => void choose(hit)}
                                className={cn(
                                    'block w-full rounded-2xl px-3 py-2 text-left',
                                    i === active && 'bg-accent text-accent-foreground',
                                )}
                            >
                                <span className="block text-sm font-medium">{hit.label}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {[hit.section, hit.card].filter((x) => x && x !== hit.label).join(' › ')}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
