import { queryOptions } from '@tanstack/react-query';
import { authClient } from './auth-client';

export const sessionQuery = queryOptions({
    queryKey: ['session'],
    queryFn: async () => {
        const { data } = await authClient.getSession();
        return data ?? null;
    },
    staleTime: 60_000,
});
