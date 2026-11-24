import { toast } from 'sonner';
import type { ApiError } from '@/lib/api';

export function errorToast(error: Error | ApiError): void {
    if ('refused' in error && error.refused) toast.error(error.message, { id: `refused:${error.refused}` });
    else toast.error(error.message);
}
