import { Link, type LinkProps } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

const base =
    'flex size-12 items-center justify-center rounded-full text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-5';

export function RailLink({ className, title, ...props }: LinkProps & { className?: string; title: string }) {
    return (
        <Link
            {...props}
            title={title}
            aria-label={title}
            className={cn(
                base,
                '[&.active]:bg-primary [&.active]:text-primary-foreground [&.active]:shadow-lg [&.active]:shadow-primary/30',
                className,
            )}
        />
    );
}

export function RailButton({ className, title, ...props }: React.ComponentProps<'button'> & { title: string }) {
    return <button type="button" title={title} aria-label={title} className={cn(base, className)} {...props} />;
}

export function Rail({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
    return (
        <aside className="sticky top-(--inset-top) flex h-[calc(100svh-var(--inset-top)-1rem)] w-18 shrink-0 flex-col items-center justify-between rounded-full bg-sidebar py-3">
            <div className="flex flex-col items-center gap-2">{top}</div>
            <div className="flex flex-col items-center gap-2">{bottom}</div>
        </aside>
    );
}
