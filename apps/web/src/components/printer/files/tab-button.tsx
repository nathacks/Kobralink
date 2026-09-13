import { cn } from '@/lib/utils';

export function TabButton({ active, ...props }: React.ComponentProps<'button'> & { active: boolean }) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
        />
    );
}
