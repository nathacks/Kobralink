import { Button } from '@/components/ui/button';
import { m } from '@/lib/i18n';

export function SaveBar({
    changed,
    submitting,
    onDiscard,
    extra,
}: {
    changed: boolean;
    submitting?: boolean;
    onDiscard?: () => void;
    extra?: React.ReactNode;
}) {
    if (!changed) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="secondary" className="rounded-full px-6" disabled={submitting}>
                    {m.common_save()}
                </Button>
                {extra}
            </div>
        );
    }
    return (
        <div
            role="status"
            className="sticky bottom-24 z-20 flex items-center gap-1 rounded-full bg-primary py-2 pr-2 pl-5 text-primary-foreground shadow-lg ring-4 ring-primary/25 duration-200 animate-in fade-in slide-in-from-bottom-2 md:bottom-4"
        >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.form_unsaved()}</span>
            {extra && <span className="hidden shrink-0 md:inline-flex">{extra}</span>}
            {onDiscard && (
                <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 rounded-full px-3 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    disabled={submitting}
                    onClick={onDiscard}
                >
                    {m.form_discard()}
                </Button>
            )}
            <Button
                type="submit"
                className="shrink-0 rounded-full bg-background px-5 text-foreground shadow-sm hover:bg-background/90"
                disabled={submitting}
            >
                {m.common_save()}
            </Button>
        </div>
    );
}
