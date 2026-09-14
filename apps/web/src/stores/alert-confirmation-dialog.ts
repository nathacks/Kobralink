import { createStore } from '@tanstack/react-store';
import type { ComponentProps, ReactElement } from 'react';
import type { AlertDialogContent } from '@/components/ui/alert-dialog';

export interface AlertConfirmationDialogState {
    isOpen: boolean;
    title?: ReactElement | string;
    props?: ComponentProps<typeof AlertDialogContent>;
    description?: ReactElement | string;
    cancelLabel?: string | null;
    actionLabel?: string | null;
    isPending: boolean;
    disableCancelButton?: boolean;
    disableActionButton?: boolean;
    onAction?: (args?: unknown) => Promise<unknown>;
    onCancel?: () => Promise<unknown>;
}

const defaultAlertState: AlertConfirmationDialogState = {
    isOpen: false,
    title: undefined,
    description: undefined,
    props: undefined,
    cancelLabel: null,
    actionLabel: null,
    disableCancelButton: false,
    disableActionButton: false,
    isPending: false,
    onAction: async () => {},
    onCancel: undefined,
};

export const alertConfirmationDialogStore = createStore(defaultAlertState, ({ setState }) => ({
    openAlertDialog: (data: Omit<AlertConfirmationDialogState, 'isOpen' | 'isPending'>) =>
        setState(() => ({
            ...defaultAlertState,
            isOpen: true,
            ...data,
        })),
    closeAlertDialog: () => setState((prev) => ({ ...prev, isOpen: false, isPending: false })),
    setPending: (isPending: boolean) => setState((prev) => ({ ...prev, isPending })),
}));
