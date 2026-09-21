import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollAreaWithShadow } from '@/components/ui/scroll-area-with-shadow';
import { useConfirmationDialog } from '@/hooks/use-confirmation-dialog';
import { cn } from '@/lib/utils';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export function ConfirmationDialog() {
    const { isOpen, title, description, content, closeOnBackground, props } = useConfirmationDialog();
    const { closeDialog } = confirmationDialogStore.actions;
    const hasHeader = Boolean(title || description);

    return (
        <Dialog open={isOpen} onOpenChange={closeDialog}>
            <DialogContent
                {...props}
                className={cn(
                    'max-h-[92svh] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-3xl px-0',
                    hasHeader ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]',
                    props?.className,
                )}
                onInteractOutside={(e) => {
                    if (!closeOnBackground) e.preventDefault();
                    props?.onInteractOutside?.(e);
                }}
            >
                {hasHeader && (
                    <DialogHeader className="px-6">
                        {title && <DialogTitle className="min-w-0 pr-6 [overflow-wrap:anywhere]">{title}</DialogTitle>}
                        {description && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>
                )}
                <ScrollAreaWithShadow
                    bottomShadow
                    className="h-full min-w-0"
                    viewportClassName="[&>div]:block! [&>div]:min-w-0! [&>div]:max-w-full"
                >
                    <div className="min-w-0 px-6">{content}</div>
                </ScrollAreaWithShadow>
            </DialogContent>
        </Dialog>
    );
}
