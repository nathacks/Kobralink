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

export const filamentProfilesQuery = queryOptions({
    queryKey: ['filament', 'profiles'],
    queryFn: api.filament.profiles,
    staleTime: 5 * 60_000,
});

export const filamentVendorsQuery = queryOptions({
    queryKey: ['filament', 'vendors'],
    queryFn: api.filament.vendors,
    staleTime: 5 * 60_000,
});

export const userProfilesQuery = queryOptions({
    queryKey: ['filament', 'user'],
    queryFn: api.filament.userProfiles,
});

export const filamentSlotsQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'filament-slots'], queryFn: () => api.filament.slots(id) });

export const fileObjectsQuery = (id: string, fileId: string) =>
    queryOptions({
        queryKey: ['printers', id, 'files', fileId, 'objects'],
        queryFn: () => api.files.objects(id, fileId),
        refetchInterval: (q) => (q.state.data?.names.length ? false : 3000),
    });

export const skipStateQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'skip'], queryFn: () => api.skip.state(id), refetchInterval: 5000 });

export const printerFilesQuery = (id: string, enabled: boolean) =>
    queryOptions({
        queryKey: ['printers', id, 'printer-files'],
        queryFn: () => api.printerFiles.list(id),
        enabled,
        staleTime: 60_000,
        retry: false,
    });

export const printerFileThumbQuery = (id: string, filename: string) =>
    queryOptions({
        queryKey: ['printers', id, 'printer-files', filename, 'thumb'],
        queryFn: () => api.printerFiles.thumbnail(id, filename),
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
    });
