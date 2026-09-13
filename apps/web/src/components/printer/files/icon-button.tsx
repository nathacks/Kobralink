import { cn } from '@/lib/utils';

export function IconButton({
    asChild,
    children,
    className,
    ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
    const cls = cn(
        'flex size-8 items-center justify-center rounded-full bg-background/40 hover:bg-background/70 [&_svg]:size-3.5',
        className,
    );
    if (asChild) return <span className={cls}>{children}</span>;
    return (
        <button type="button" className={cls} {...props}>
            {children}
        </button>
    );
}
