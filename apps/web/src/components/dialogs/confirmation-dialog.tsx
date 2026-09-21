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
                    'max-h-[92svh] rounded-3xl',
                    hasHeader ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]',
                    props?.className,
                )}
                onInteractOutside={(e) => {
                    if (!closeOnBackground) e.preventDefault();
                    props?.onInteractOutside?.(e);
                }}
            >
                {hasHeader && (
                    <DialogHeader>
                        {title && <DialogTitle className="[overflow-wrap:anywhere]">{title}</DialogTitle>}
                        {description && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>
                )}
                <ScrollAreaWithShadow
                    bottomShadow
                    className="-mx-6 h-full min-w-0"
                    viewportClassName="px-6 [&>div]:!block [&>div]:min-w-0"
                >
                    {content}
                </ScrollAreaWithShadow>
            </DialogContent>
        </Dialog>
    );
}
