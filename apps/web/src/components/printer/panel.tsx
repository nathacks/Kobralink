import { cn } from '@/lib/utils';

export function Panel({
    title,
    description,
    action,
    className,
    children,
    ...props
}: Omit<React.ComponentProps<'section'>, 'title'> & {
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <section
            {...props}
            className={cn('flex min-w-0 flex-col gap-5 rounded-3xl bg-card p-5 text-card-foreground sm:p-6', className)}
        >
            {(title || action) && (
                <header className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                        <h2 className="text-lg font-medium leading-tight">{title}</h2>
                        {description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
                    </div>
                    {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
                </header>
            )}
            {children}
        </section>
    );
}

export function IconButton({ title, className, ...props }: React.ComponentProps<'button'> & { title: string }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            {...props}
            className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent disabled:opacity-40 [&_svg]:size-4',
                className,
            )}
        />
    );
}

export interface SegmentOption<T> {
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    title?: string;
}

export function Segmented<T extends string | number>({
    options,
    value,
    onSelect,
    disabled,
    label,
    className,
}: {
    options: SegmentOption<T>[];
    value?: T;
    onSelect: (value: T) => void;
    disabled?: boolean;
    label?: string;
    className?: string;
}) {
    return (
        <fieldset aria-label={label} className={cn('flex min-w-0 gap-1 rounded-full bg-secondary p-1', className)}>
            {options.map((o) => {
                const active = value === o.value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        aria-pressed={value === undefined ? undefined : active}
                        title={o.title}
                        aria-label={o.title}
                        disabled={disabled}
                        onClick={() => onSelect(o.value)}
                        className={cn(
                            'flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-50 [&_svg]:size-4',
                            active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground enabled:hover:bg-background/60 enabled:hover:text-foreground',
                        )}
                    >
                        {o.icon}
                        {o.label}
                    </button>
                );
            })}
        </fieldset>
    );
}

export function EmptyState({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground [&>svg]:size-5 [&>svg]:shrink-0">
            {icon}
            <span>{children}</span>
        </div>
    );
}
