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
                        {title && <DialogTitle>{title}</DialogTitle>}
                        {description && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>
                )}
                <ScrollAreaWithShadow bottomShadow className="-mx-6 h-full" viewportClassName="px-6 [&>div]:!block">
                    {content}
                </ScrollAreaWithShadow>
            </DialogContent>
        </Dialog>
    );
}
