import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { create } from 'zustand';
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

export interface ConfirmationDialogActions {
    openDialog: (data: Omit<ConfirmationDialogState, 'isOpen'> | null, keepPrevData?: boolean) => void;
    closeDialog: () => void;
}

export type ConfirmationDialogStore = ConfirmationDialogState & ConfirmationDialogActions;

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

export const useConfirmationDialogStore = create<ConfirmationDialogStore>((set, get) => ({
    ...defaultState,
    openDialog: (data, keepPrevData) =>
        set(() => {
            const prevState = get();
            return {
                ...(keepPrevData ? prevState : defaultState),
                isOpen: true,
                ...data,
            };
        }),
    closeDialog: () => set({ isOpen: false }),
}));
