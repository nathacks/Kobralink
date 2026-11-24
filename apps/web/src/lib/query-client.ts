import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorToast } from '@/lib/error-toast';

export const createQueryClient = () =>
    new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
        mutationCache: new MutationCache({
            onError: (error, _vars, _ctx, mutation) => {
                console.error('[kobralink] mutation failed', error);
                if (mutation.options.onError || mutation.meta?.silent) return;
                errorToast(error);
            },
        }),
        queryCache: new QueryCache({
            onError: (error, query) => {
                console.error('[kobralink] query failed', query.queryKey, error);
                if (query.meta?.silent) return;
                toast.error(error.message, { id: `query:${query.queryHash}` });
            },
        }),
    });
