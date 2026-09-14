import { Loader2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { m } from '@/lib/i18n';
import { useAlertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export function AlertConfirmationDialog() {
    const {
        isOpen,
        title,
        description,
        props,
        cancelLabel,
        actionLabel,
        isPending,
        disableCancelButton,
        disableActionButton,
        onAction,
        onCancel,
        closeAlertDialog,
        setPending,
    } = useAlertConfirmationDialogStore();

    const handleCancel = async () => {
        if (onCancel) await onCancel();
        closeAlertDialog();
    };

    const handleAction = async () => {
        if (!onAction) {
            closeAlertDialog();
            return;
        }
        setPending(true);
        try {
            await onAction();
            closeAlertDialog();
        } finally {
            setPending(false);
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={(open) => !open && !isPending && closeAlertDialog()}>
            <AlertDialogContent {...props} className={props?.className ?? 'rounded-3xl'}>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title ?? m.common_confirm()}</AlertDialogTitle>
                    {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    {cancelLabel !== null && (
                        <AlertDialogCancel
                            disabled={disableCancelButton || isPending}
                            onClick={(e) => {
                                e.preventDefault();
                                void handleCancel();
                            }}
                        >
                            {cancelLabel ?? m.common_cancel()}
                        </AlertDialogCancel>
                    )}
                    <AlertDialogAction
                        disabled={disableActionButton || isPending}
                        onClick={(e) => {
                            e.preventDefault();
                            void handleAction();
                        }}
                    >
                        {isPending && <Loader2 className="animate-spin" />}
                        {actionLabel ?? m.common_confirm()}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
