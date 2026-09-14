import { useSelector } from '@tanstack/react-store';
import { alertConfirmationDialogStore } from '@/stores/alert-confirmation-dialog';

export const useAlertConfirmationDialog = () => useSelector(alertConfirmationDialogStore);
