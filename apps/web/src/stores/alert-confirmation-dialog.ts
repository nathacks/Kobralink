import type { ComponentProps, ReactElement } from 'react';
import { create } from 'zustand';
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

export interface AlertConfirmationDialogActions {
    openAlertDialog: (data: Omit<AlertConfirmationDialogState, 'isOpen' | 'isPending'>) => void;
    closeAlertDialog: () => void;
    setPending: (isPending: boolean) => void;
}

export type AlertConfirmationDialogStore = AlertConfirmationDialogState & AlertConfirmationDialogActions;

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

export const useAlertConfirmationDialogStore = create<AlertConfirmationDialogStore>((set) => ({
    ...defaultAlertState,
    openAlertDialog: (data) =>
        set({
            ...defaultAlertState,
            isOpen: true,
            ...data,
        }),
    closeAlertDialog: () => set({ isOpen: false, isPending: false }),
    setPending: (isPending) => set({ isPending }),
}));
