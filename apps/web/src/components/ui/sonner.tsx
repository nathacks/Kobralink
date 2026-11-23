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
            {...props}
        />
    );
};

export { Toaster };
