import type {
    AceAutoFeedInput,
    AceDryInput,
    AddPrinterInput,
    AddQueueItemInput,
    AmsFeedInput,
    AmsSetSlotInput,
    AppSettings,
    BackupInfoDto,
    CreateUserInput,
    DetectionModelDto,
    FailureDetectionStatusDto,
    FilamentProfile,
    FileObjectsDto,
    GcodeFileDto,
    ImportProfilesResult,
    KobralinkEvent,
    LocalSpoolDto,
    LocalSpoolInput,
    MacroDto,
    MacroInput,
    MoveAxisInput,
    PowerState,
    Printer,
    PrinterDetectionDto,
    PrinterFileDto,
    PrinterLiveState,
    PrintJobDto,
    PrintPrinterFileInput,
    QueueItemDto,
    ScheduleDryInput,
    ScheduledDryDto,
    SetFanInput,
    SetLightInput,
    SetSlotProfileInput,
    SetSpeedInput,
    SetTemperatureInput,
    SkipStateDto,
    SlotFilamentInfo,
    SlotProfileRef,
    SpoolmanSpool,
    SpoolmanStatus,
    StartPrintInput,
    StatsDto,
    SystemInfoDto,
    TimelapseDto,
    UpdateAppSettingsInput,
    UpdateLocalSpoolInput,
    UpdatePrinterInput,
    UpdateUserInput,
    UserDto,
} from '@kobralink/shared';
import { getLocale } from '@/lib/i18n';

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly issues?: { path: string; message: string }[],
    ) {
        super(message);
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
        credentials: 'include',
        ...init,
        headers: {
            'accept-language': getLocale(),
            ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
            ...(init.headers ?? {}),
        },
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    if (!res.ok) {
        const b = body as {
            message?: string | string[];
            error?: string;
            issues?: { path: string; message: string }[];
        } | null;
        const msg = Array.isArray(b?.message) ? b.message.join(', ') : (b?.message ?? b?.error ?? `HTTP ${res.status}`);
        throw new ApiError(res.status, msg, b?.issues);
    }
    return body as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export type PrinterWithLive = Printer & { live: PrinterLiveState | null };

export const api = {
    setupStatus: () => request<{ needsSetup: boolean }>('/kx/setup/status'),

    printers: {
        list: () => request<PrinterWithLive[]>('/kx/printers'),
        get: (id: string) => request<PrinterWithLive>(`/kx/printers/${id}`),
        add: (input: AddPrinterInput) => request<Printer>('/kx/printers', json(input)),
        update: (id: string, input: UpdatePrinterInput) =>
            request<Printer>(`/kx/printers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/kx/printers/${id}`, { method: 'DELETE' }),
        reconnect: (id: string) => request<void>(`/kx/printers/${id}/reconnect`, { method: 'POST' }),
        connect: (id: string) => request<void>(`/kx/printers/${id}/connect`, { method: 'POST' }),
        disconnect: (id: string) => request<void>(`/kx/printers/${id}/disconnect`, { method: 'POST' }),
        power: (id: string, action: 'on' | 'off') =>
            request<{ state: PowerState }>(`/kx/printers/${id}/power`, json({ action })),
        powerStatus: (id: string) => request<{ state: PowerState; configured: boolean }>(`/kx/printers/${id}/power`),
        refreshCredentials: (id: string) =>
            request<Printer>(`/kx/printers/${id}/refresh-credentials`, { method: 'POST' }),
        state: (id: string) => request<PrinterLiveState>(`/kx/printers/${id}/state`),
    },

    control: {
        temperature: (id: string, input: SetTemperatureInput) =>
            request<void>(`/kx/printers/${id}/temperature`, json(input)),
        fan: (id: string, input: SetFanInput) => request<void>(`/kx/printers/${id}/fan`, json(input)),
        light: (id: string, input: SetLightInput) => request<void>(`/kx/printers/${id}/light`, json(input)),
        speed: (id: string, input: SetSpeedInput) => request<void>(`/kx/printers/${id}/speed`, json(input)),
        axis: (id: string, input: MoveAxisInput) => request<void>(`/kx/printers/${id}/axis`, json(input)),
        axisOff: (id: string) => request<void>(`/kx/printers/${id}/axis/off`, { method: 'POST' }),
        pause: (id: string) => request<void>(`/kx/printers/${id}/print/pause`, { method: 'POST' }),
        resume: (id: string) => request<void>(`/kx/printers/${id}/print/resume`, { method: 'POST' }),
        cancel: (id: string) => request<void>(`/kx/printers/${id}/print/cancel`, { method: 'POST' }),
        clearFileReady: (id: string) => request<void>(`/kx/printers/${id}/file-ready/clear`, { method: 'POST' }),
    },

    ams: {
        setSlot: (id: string, input: AmsSetSlotInput) => request<void>(`/kx/printers/${id}/ams/slot`, json(input)),
        feed: (id: string, input: AmsFeedInput) => request<void>(`/kx/printers/${id}/ams/feed`, json(input)),
        autoFeed: (id: string, input: AceAutoFeedInput) =>
            request<void>(`/kx/printers/${id}/ace/auto-feed`, json(input)),
        dry: (id: string, input: AceDryInput) => request<void>(`/kx/printers/${id}/ace/dry`, json(input)),
    },

    printerFiles: {
        list: (id: string) => request<PrinterFileDto[]>(`/kx/printers/${id}/printer-files`),
        remove: (id: string, filenames: string[]) =>
            request<void>(`/kx/printers/${id}/printer-files/delete`, json({ filenames })),
        print: (id: string, input: PrintPrinterFileInput) =>
            request<void>(`/kx/printers/${id}/printer-files/print`, json(input)),
        thumbnail: (id: string, filename: string) =>
            request<{ thumbnail: string }>(
                `/kx/printers/${id}/printer-files/thumbnail?filename=${encodeURIComponent(filename)}`,
            ),
    },

    settings: {
        get: () => request<AppSettings>('/kx/settings'),
        update: (input: UpdateAppSettingsInput) =>
            request<AppSettings>('/kx/settings', { method: 'PATCH', body: JSON.stringify(input) }),
    },

    detection: {
        status: () => request<FailureDetectionStatusDto>('/kx/detection'),
        printer: (id: string) => request<PrinterDetectionDto | null>(`/kx/printers/${id}/detection`),
        download: () => request<DetectionModelDto>('/kx/detection/model/download', { method: 'POST' }),
        cancelDownload: () => request<DetectionModelDto>('/kx/detection/model/cancel', { method: 'POST' }),
        deleteModel: () => request<DetectionModelDto>('/kx/detection/model', { method: 'DELETE' }),
    },

    spoolman: {
        spools: () => request<SpoolmanSpool[]>('/kx/spoolman/spools'),
        health: () => request<{ reachable: boolean; configured: boolean }>('/kx/spoolman/health'),
        status: (id: string) => request<SpoolmanStatus>(`/kx/printers/${id}/spoolman`),
        setSlots: (id: string, slotMap: Record<string, number>) =>
            request<{ slotSpools: Record<string, number> }>(`/kx/printers/${id}/spoolman/slots`, json({ slotMap })),
    },

    logs: {
        streamUrl: '/kx/logs/stream',
        downloadUrl: '/kx/logs/download',
    },

    events: {
        streamUrl: '/kx/events',
        recent: () => request<KobralinkEvent[]>('/kx/notifications'),
        test: () =>
            request<{ delivered: string[]; failed: { channel: string; error: string }[] }>('/kx/notifications/test', {
                method: 'POST',
            }),
    },

    spools: {
        list: (archived = false) => request<LocalSpoolDto[]>(`/kx/spools?archived=${archived}`),
        create: (input: LocalSpoolInput) => request<LocalSpoolDto>('/kx/spools', json(input)),
        update: (id: string, input: UpdateLocalSpoolInput) =>
            request<LocalSpoolDto>(`/kx/spools/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/kx/spools/${id}`, { method: 'DELETE' }),
        assignments: (printerId: string) =>
            request<{ slotSpools: Record<string, string> }>(`/kx/printers/${printerId}/spools`),
        assign: (printerId: string, slotMap: Record<string, string | null>) =>
            request<{ slotSpools: Record<string, string> }>(`/kx/printers/${printerId}/spools`, json({ slotMap })),
    },

    timelapses: {
        list: (printerId?: string) =>
            request<TimelapseDto[]>(printerId ? `/kx/printers/${printerId}/timelapses` : '/kx/timelapses'),
        remove: (id: string) => request<void>(`/kx/timelapses/${id}`, { method: 'DELETE' }),
        videoUrl: (id: string) => `/kx/timelapses/${id}/video`,
        posterUrl: (id: string) => `/kx/timelapses/${id}/poster`,
    },

    stats: (printerId?: string, days = 0) =>
        request<StatsDto>(`/kx/stats?printerId=${encodeURIComponent(printerId ?? '')}&days=${days}`),

    queue: {
        list: (printerId: string) => request<QueueItemDto[]>(`/kx/printers/${printerId}/queue`),
        add: (printerId: string, input: AddQueueItemInput) =>
            request<QueueItemDto>(`/kx/printers/${printerId}/queue`, json(input)),
        reorder: (printerId: string, ids: string[]) =>
            request<QueueItemDto[]>(`/kx/printers/${printerId}/queue/reorder`, json({ ids })),
        start: (printerId: string) =>
            request<QueueItemDto>(`/kx/printers/${printerId}/queue/start`, { method: 'POST' }),
        remove: (printerId: string, itemId: string) =>
            request<void>(`/kx/printers/${printerId}/queue/${itemId}`, { method: 'DELETE' }),
        clear: (printerId: string) => request<void>(`/kx/printers/${printerId}/queue`, { method: 'DELETE' }),
    },

    macros: {
        list: () => request<MacroDto[]>('/kx/macros'),
        create: (input: MacroInput) => request<MacroDto>('/kx/macros', json(input)),
        update: (id: string, input: MacroInput) =>
            request<MacroDto>(`/kx/macros/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/kx/macros/${id}`, { method: 'DELETE' }),
        reorder: (ids: string[]) => request<MacroDto[]>('/kx/macros/reorder', json({ ids })),
        run: (printerId: string, macroId: string) =>
            request<void>(`/kx/printers/${printerId}/macros/${macroId}/run`, { method: 'POST' }),
    },

    drySchedule: {
        list: (printerId: string) => request<ScheduledDryDto[]>(`/kx/printers/${printerId}/dry-schedule`),
        create: (printerId: string, input: ScheduleDryInput) =>
            request<ScheduledDryDto>(`/kx/printers/${printerId}/dry-schedule`, json(input)),
        remove: (printerId: string, id: string) =>
            request<void>(`/kx/printers/${printerId}/dry-schedule/${id}`, { method: 'DELETE' }),
    },

    users: {
        list: () => request<UserDto[]>('/kx/users'),
        create: (input: CreateUserInput) => request<UserDto>('/kx/users', json(input)),
        update: (id: string, input: UpdateUserInput) =>
            request<UserDto>(`/kx/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/kx/users/${id}`, { method: 'DELETE' }),
    },

    system: {
        info: () => request<SystemInfoDto>('/kx/system'),
        checkUpdate: () => request<SystemInfoDto['update']>('/kx/system/update-check', { method: 'POST' }),
        backupInfo: () => request<BackupInfoDto>('/kx/system/backup/info'),
        backupUrl: (timelapses: boolean) => `/kx/system/backup?timelapses=${timelapses}`,
        restore: (file: File) => {
            const fd = new FormData();
            fd.append('file', file, file.name);
            return request<{ files: number; restarting: boolean }>('/kx/system/restore', { method: 'POST', body: fd });
        },
        restart: () => request<{ restarting: boolean }>('/kx/system/restart', { method: 'POST' }),
    },

    skip: {
        state: (id: string) => request<SkipStateDto>(`/kx/printers/${id}/skip/state`),
        query: (id: string) => request<SkipStateDto>(`/kx/printers/${id}/skip/query`, { method: 'POST' }),
        apply: (id: string, names: string[]) => request<void>(`/kx/printers/${id}/skip`, json({ names })),
    },

    filament: {
        profiles: () => request<FilamentProfile[]>('/kx/filament/profiles'),
        vendors: () => request<string[]>('/kx/filament/vendors'),
        userProfiles: () => request<FilamentProfile[]>('/kx/filament/profiles/user'),
        importProfiles: (files: File[]) => {
            const fd = new FormData();
            for (const f of files) fd.append('files', f, f.name);
            return request<ImportProfilesResult>('/kx/filament/profiles/user', { method: 'POST', body: fd });
        },
        deleteUserProfile: (vendor: string, name: string) =>
            request<{ removed: number; totalUser: number }>(
                `/kx/filament/profiles/user?vendor=${encodeURIComponent(vendor)}&name=${encodeURIComponent(name)}`,
                { method: 'DELETE' },
            ),
        slots: (id: string) => request<SlotFilamentInfo[]>(`/kx/printers/${id}/filament/slots`),
        setSlotProfile: (id: string, slotIndex: number, input: SetSlotProfileInput) =>
            request<{ slotIndex: number; profile: SlotProfileRef | null }>(
                `/kx/printers/${id}/filament/slots/${slotIndex}/profile`,
                json(input),
            ),
    },

    camera: {
        start: (id: string) => request<{ state: string }>(`/kx/printers/${id}/camera/start`, { method: 'POST' }),
        stop: (id: string) => request<void>(`/kx/printers/${id}/camera/stop`, { method: 'POST' }),
        reset: (id: string) => request<void>(`/kx/printers/${id}/camera/reset`, { method: 'POST' }),
        streamUrl: (id: string) => `/kx/printers/${id}/camera/stream`,
        snapshotUrl: (id: string) => `/kx/printers/${id}/camera/snapshot`,
    },

    files: {
        list: (id: string) => request<GcodeFileDto[]>(`/kx/printers/${id}/files`),
        upload: (id: string, file: File, print: boolean) => {
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('print', String(print));
            return request<GcodeFileDto>(`/kx/printers/${id}/files`, { method: 'POST', body: fd });
        },
        print: (id: string, input: StartPrintInput) => request<GcodeFileDto>(`/kx/printers/${id}/print`, json(input)),
        objects: (id: string, fileId: string) => request<FileObjectsDto>(`/kx/printers/${id}/files/${fileId}/objects`),
        remove: (id: string, fileId: string) =>
            request<void>(`/kx/printers/${id}/files/${fileId}`, { method: 'DELETE' }),
        verify: (id: string, fileId: string) =>
            request<void>(`/kx/printers/${id}/files/${fileId}/verify`, { method: 'POST' }),
        downloadUrl: (id: string, fileId: string) => `/kx/printers/${id}/files/${fileId}/download`,
        history: (id: string, limit = 50) => request<PrintJobDto[]>(`/kx/printers/${id}/history?limit=${limit}`),
    },
};
