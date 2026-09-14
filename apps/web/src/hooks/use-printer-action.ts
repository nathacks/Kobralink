import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export function usePrinterAction(printerId: string, fn: (id: string) => Promise<void>, ok: () => string) {
    return useMutation({
        mutationFn: () => fn(printerId),
        onSuccess: () => toast.success(ok()),
        onError: (e) => toast.error(e.message),
    });
}
