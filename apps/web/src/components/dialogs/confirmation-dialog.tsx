import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirmationDialog } from '@/hooks/use-confirmation-dialog';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export function ConfirmationDialog() {
    const { isOpen, title, description, content, closeOnBackground, props } = useConfirmationDialog();
    const { closeDialog } = confirmationDialogStore.actions;

    return (
        <Dialog open={isOpen} onOpenChange={closeDialog}>
            <DialogContent
                {...props}
                className={props?.className ?? 'rounded-3xl'}
                onInteractOutside={(e) => {
                    if (!closeOnBackground) e.preventDefault();
                    props?.onInteractOutside?.(e);
                }}
            >
                {(title || description) && (
                    <DialogHeader>
                        {title && <DialogTitle>{title}</DialogTitle>}
                        {description && <DialogDescription>{description}</DialogDescription>}
                    </DialogHeader>
                )}
                {content}
            </DialogContent>
        </Dialog>
    );
}
