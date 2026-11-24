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
        <>
            {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
            <div
                role="status"
                className="sticky bottom-24 z-20 flex min-w-0 items-center gap-1 rounded-full bg-primary p-2 text-primary-foreground shadow-lg ring-4 ring-primary/25 duration-200 animate-in fade-in slide-in-from-bottom-2 md:bottom-4"
            >
                <span className="min-w-0 flex-1 truncate pl-3 text-sm font-medium max-sm:sr-only">
                    {m.form_unsaved()}
                </span>
                {onDiscard && (
                    <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full px-4 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground max-sm:flex-1"
                        disabled={submitting}
                        onClick={onDiscard}
                    >
                        {m.form_discard()}
                    </Button>
                )}
                <Button
                    type="submit"
                    className="rounded-full bg-background px-5 text-foreground shadow-sm hover:bg-background/90 max-sm:flex-1"
                    disabled={submitting}
                >
                    {m.common_save()}
                </Button>
            </div>
        </>
    );
}
