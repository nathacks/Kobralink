import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

export const printersQuery = queryOptions({
    queryKey: ['printers'],
    queryFn: api.printers.list,
    refetchInterval: 10_000,
});

export const printerQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id], queryFn: () => api.printers.get(id) });

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
        meta: { silent: true },
    });

export const powerStatusQuery = (id: string, enabled: boolean) =>
    queryOptions({
        queryKey: ['printers', id, 'power'],
        queryFn: () => api.printers.powerStatus(id),
        enabled,
        refetchInterval: 15_000,
        retry: false,
    });

export const appSettingsQuery = queryOptions({ queryKey: ['settings'], queryFn: api.settings.get });

export const spoolmanStatusQuery = (id: string) =>
    queryOptions({
        queryKey: ['printers', id, 'spoolman'],
        queryFn: () => api.spoolman.status(id),
        staleTime: 30_000,
        retry: false,
    });

export const spoolmanSpoolsQuery = (enabled: boolean) =>
    queryOptions({
        queryKey: ['spoolman', 'spools'],
        queryFn: api.spoolman.spools,
        enabled,
        staleTime: 60_000,
        retry: false,
    });

export const spoolsQuery = (archived = false) =>
    queryOptions({ queryKey: ['spools', archived], queryFn: () => api.spools.list(archived) });

export const spoolAssignmentsQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'spools'], queryFn: () => api.spools.assignments(id) });

export const timelapsesQuery = (id?: string) =>
    queryOptions({
        queryKey: ['timelapses', id ?? 'all'],
        queryFn: () => api.timelapses.list(id),
        refetchInterval: (q) =>
            q.state.data?.some((t) => t.status !== 'ready' && t.status !== 'error') ? 5000 : false,
    });

export const statsQuery = (printerId: string | undefined, days: number) =>
    queryOptions({ queryKey: ['stats', printerId ?? 'all', days], queryFn: () => api.stats(printerId, days) });

export const queueQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'queue'], queryFn: () => api.queue.list(id) });

export const allQueueQuery = queryOptions({ queryKey: ['queue'], queryFn: api.queue.all, refetchInterval: 15_000 });

export const allFilesQuery = queryOptions({ queryKey: ['files'], queryFn: api.files.all });

export const allHistoryQuery = (printerId?: string) =>
    queryOptions({ queryKey: ['history', printerId ?? ''], queryFn: () => api.files.historyAll(printerId) });

export const queueStatusQuery = (id: string) =>
    queryOptions({
        queryKey: ['printers', id, 'queue-status'],
        queryFn: () => api.queue.status(id),
        refetchInterval: 15_000,
    });

export const scheduleQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'schedule'], queryFn: () => api.schedule.list(id) });

export const maintenanceQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'maintenance'], queryFn: () => api.maintenance.list(id) });

export const macrosQuery = queryOptions({ queryKey: ['macros'], queryFn: api.macros.list });

export const automationsQuery = queryOptions({ queryKey: ['automations'], queryFn: api.automations.list });

export const dryScheduleQuery = (id: string) =>
    queryOptions({ queryKey: ['printers', id, 'dry-schedule'], queryFn: () => api.drySchedule.list(id) });

export const usersQuery = queryOptions({ queryKey: ['users'], queryFn: api.users.list, retry: false });

export const systemInfoQuery = queryOptions({ queryKey: ['system'], queryFn: api.system.info, staleTime: 60_000 });

export const backupInfoQuery = queryOptions({ queryKey: ['system', 'backup'], queryFn: api.system.backupInfo });

export const notificationsQuery = queryOptions({ queryKey: ['notifications'], queryFn: api.events.recent });

export const detectionStatusQuery = queryOptions({
    queryKey: ['detection'],
    queryFn: api.detection.status,
    refetchInterval: (q) => (q.state.data?.model.state === 'downloading' ? 1000 : 10_000),
});

export const printerDetectionQuery = (id: string, enabled: boolean) =>
    queryOptions({
        queryKey: ['printers', id, 'detection'],
        queryFn: () => api.detection.printer(id),
        enabled,
        refetchInterval: 5000,
    });

export const haEnergySensorsQuery = queryOptions({
    queryKey: ['home-assistant', 'energy-sensors'],
    queryFn: api.homeAssistant.energySensors,
    staleTime: 30_000,
    retry: false,
});

export const haSwitchesQuery = queryOptions({
    queryKey: ['home-assistant', 'switches'],
    queryFn: api.homeAssistant.switches,
    staleTime: 30_000,
    retry: false,
});
