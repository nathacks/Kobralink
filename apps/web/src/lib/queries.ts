import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

export const printersQuery = queryOptions({
    queryKey: ['printers'],
    queryFn: api.printers.list,
    refetchInterval: 10_000,
});

export const printerQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id], queryFn: () => api.printers.get(id) });

export const printerStateQuery = (id: string) =>
    queryOptions({
        queryKey: ['printers', id, 'state'],
        queryFn: () => api.printers.state(id),

        refetchInterval: 15_000,
    });

export const filesQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'files'], queryFn: () => api.files.list(id) });

export const historyQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'history'], queryFn: () => api.files.history(id) });

export const setupQuery = queryOptions({
    queryKey: ['setup'],
    queryFn: api.setupStatus,
    staleTime: 0,
});
