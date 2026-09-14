import { createStore } from '@tanstack/react-store';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import type { DialogContent } from '@/components/ui/dialog';

export interface ConfirmationDialogState {
    isOpen: boolean;
    title?: ReactElement | string;
    props?: ComponentProps<typeof DialogContent>;
    closeOnBackground?: boolean;
    description?: string | ReactElement;
    content?: ReactNode;
    onSuccess?: (args?: unknown) => void;
    onError?: () => void;
}

const defaultState: ConfirmationDialogState = {
    isOpen: false,
    title: undefined,
    props: undefined,
    closeOnBackground: true,
    description: undefined,
    content: undefined,
    onSuccess: undefined,
    onError: undefined,
};

export const confirmationDialogStore = createStore(defaultState, ({ setState }) => ({
    openDialog: (data: Omit<ConfirmationDialogState, 'isOpen'> | null, keepPrevData?: boolean) =>
        setState((prev) => ({
            ...(keepPrevData ? prev : defaultState),
            isOpen: true,
            ...data,
        })),
    closeDialog: () => setState((prev) => ({ ...prev, isOpen: false })),
}));
