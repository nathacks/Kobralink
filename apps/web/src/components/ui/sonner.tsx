import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useResolvedTheme } from '@/hooks/use-theme';

const Toaster = ({ ...props }: ToasterProps) => {
    const theme = useResolvedTheme();
    return (
        <Sonner
            theme={theme}
            className="toaster group"
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'calc(var(--radius) - 8px)',
                } as React.CSSProperties
            }
            toastOptions={{
                classNames: {
                    toast: 'flex-wrap',
                    content: 'min-w-0 flex-1',
                    actionButton:
                        'mx-0! mt-2! h-8! w-full justify-center rounded-full! bg-primary/15! text-[13px]! text-primary-strong! transition-colors! hover:bg-primary/25! focus-visible:ring-[3px]! focus-visible:ring-ring/50!',
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
