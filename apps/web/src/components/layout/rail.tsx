import { Link, type LinkProps } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

const base =
    'flex size-11 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:size-12 [&_svg]:size-5';

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
        <aside className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex h-16 items-center justify-around rounded-full bg-sidebar px-2 shadow-xl shadow-black/40 md:sticky md:inset-x-auto md:top-(--inset-top) md:bottom-auto md:h-[calc(100svh-var(--inset-top)-1rem)] md:w-18 md:flex-col md:justify-between md:px-0 md:py-3 md:shadow-none">
            <div className="contents md:flex md:flex-col md:items-center md:gap-2">{top}</div>
            <div className="contents md:flex md:flex-col md:items-center md:gap-2">{bottom}</div>
        </aside>
    );
}
