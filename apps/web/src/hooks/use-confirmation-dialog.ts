import { useSelector } from '@tanstack/react-store';
import { confirmationDialogStore } from '@/stores/confirmation-dialog';

export const useConfirmationDialog = () => useSelector(confirmationDialogStore);
