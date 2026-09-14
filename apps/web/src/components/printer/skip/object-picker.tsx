import { Check } from 'lucide-react';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function ObjectPicker({
    objects,
    selected,
    locked = [],
    onToggle,
    svgB64,
}: {
    objects: string[];
    selected: string[];
    locked?: string[];
    onToggle: (name: string) => void;
    svgB64?: string;
}) {
    return (
        <div className="grid gap-4">
            {svgB64 && (
                <div className="overflow-hidden rounded-2xl bg-secondary/60 p-2">
                    <img
                        src={`data:image/svg+xml;base64,${svgB64}`}
                        alt={m.objects_layout_alt()}
                        className="mx-auto max-h-56 w-auto"
                    />
                </div>
            )}
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {objects.map((name) => {
                    const isLocked = locked.includes(name);
                    const on = isLocked || selected.includes(name);
                    return (
                        <li key={name}>
                            <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => onToggle(name)}
                                aria-pressed={on}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-full px-3 py-2 text-left text-sm transition-colors',
                                    on ? 'bg-destructive/10 text-destructive line-through' : 'hover:bg-secondary',
                                    isLocked && 'opacity-60',
                                )}
                            >
                                <span
                                    className={cn(
                                        'flex size-5 shrink-0 items-center justify-center rounded-full border',
                                        on
                                            ? 'border-destructive bg-destructive text-white'
                                            : 'border-muted-foreground/40',
                                    )}
                                >
                                    {on && <Check className="size-3" />}
                                </span>
                                <span className="truncate">{prettyName(name)}</span>
                                {isLocked && (
                                    <span className="ml-auto text-xs no-underline">{m.objects_skipped()}</span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export function prettyName(name: string): string {
    return (
        name
            .replace(/_id_\d+_copy_\d+$/, '')
            .replace(/[_.]+/g, ' ')
            .trim() || name
    );
}
