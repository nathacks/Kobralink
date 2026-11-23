import type {
    AceAutoFeedInput,
    AceDryInput,
    AddPrinterInput,
    AddQueueItemInput,
    AmsFeedInput,
    AmsSetSlotInput,
    AppSettings,
    AutomationRuleDto,
    AutomationRuleInput,
    BackupInfoDto,
    BedClearResultDto,
    CompleteMaintenanceInput,
    CreateUserInput,
    DetectionModelDto,
    FailureDetectionStatusDto,
    FailureReason,
    FilamentProfile,
    FileObjectsDto,
    GcodeFileDto,
    HaEnergySensorDto,
    HaSwitchDto,
    HaTestResultDto,
    HomeAssistantTestInput,
    ImportProfilesResult,
    KobralinkEvent,
    LocalSpoolDto,
    LocalSpoolInput,
    MacroDto,
    MacroInput,
    MaintenanceLogDto,
    MaintenanceTaskDto,
    MaintenanceTaskInput,
    MoveAxisInput,
    PowerState,
    Printer,
    PrinterDetectionDto,
    PrinterFileListDto,
    PrinterLiveState,
    PrinterSample,
    PrintJobDto,
    PrintPrinterFileInput,
    QueueCheckDto,
    QueueCheckInput,
    QueueItemDto,
    QueueStatusDto,
    ScheduleDryInput,
    ScheduledDryDto,
    ScheduledPrintDto,
    SchedulePrintInput,
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
    UpdatePrintJobInput,
    UpdateUserInput,
    UserDto,
} from '@kobralink/shared';
import { printerSettingsSchema } from '@kobralink/shared';
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

export function withFullSettings<T extends { settings: unknown }>(printer: T): T {
    const parsed = printerSettingsSchema.safeParse(printer.settings ?? {});
    return parsed.success ? { ...printer, settings: parsed.data } : printer;
}

export const api = {
    setupStatus: () => request<{ needsSetup: boolean }>('/api/v1/setup/status'),

    printers: {
        list: () => request<PrinterWithLive[]>('/api/v1/printers').then((list) => list.map(withFullSettings)),
        get: (id: string) => request<PrinterWithLive>(`/api/v1/printers/${id}`).then(withFullSettings),
        add: (input: AddPrinterInput) => request<Printer>('/api/v1/printers', json(input)),
        update: (id: string, input: UpdatePrinterInput) =>
            request<Printer>(`/api/v1/printers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/api/v1/printers/${id}`, { method: 'DELETE' }),
        reconnect: (id: string) => request<void>(`/api/v1/printers/${id}/reconnect`, { method: 'POST' }),
        connect: (id: string) => request<void>(`/api/v1/printers/${id}/connect`, { method: 'POST' }),
        disconnect: (id: string) => request<void>(`/api/v1/printers/${id}/disconnect`, { method: 'POST' }),
        power: (id: string, action: 'on' | 'off') =>
            request<{ state: PowerState }>(`/api/v1/printers/${id}/power`, json({ action })),
        powerStatus: (id: string) =>
            request<{ state: PowerState; configured: boolean }>(`/api/v1/printers/${id}/power`),
        refreshCredentials: (id: string) =>
            request<Printer>(`/api/v1/printers/${id}/refresh-credentials`, { method: 'POST' }),
        state: (id: string) => request<PrinterLiveState>(`/api/v1/printers/${id}/state`),
        samples: (id: string) => request<PrinterSample[]>(`/api/v1/printers/${id}/samples`),
    },

    control: {
        temperature: (id: string, input: SetTemperatureInput) =>
            request<void>(`/api/v1/printers/${id}/temperature`, json(input)),
        fan: (id: string, input: SetFanInput) => request<void>(`/api/v1/printers/${id}/fan`, json(input)),
        light: (id: string, input: SetLightInput) => request<void>(`/api/v1/printers/${id}/light`, json(input)),
        speed: (id: string, input: SetSpeedInput) => request<void>(`/api/v1/printers/${id}/speed`, json(input)),
        axis: (id: string, input: MoveAxisInput) => request<void>(`/api/v1/printers/${id}/axis`, json(input)),
        axisOff: (id: string) => request<void>(`/api/v1/printers/${id}/axis/off`, { method: 'POST' }),
        pause: (id: string) => request<void>(`/api/v1/printers/${id}/print/pause`, { method: 'POST' }),
        resume: (id: string) => request<void>(`/api/v1/printers/${id}/print/resume`, { method: 'POST' }),
        cancel: (id: string, reason: FailureReason | '' = '') =>
            request<void>(`/api/v1/printers/${id}/print/cancel`, json({ reason })),
        clearFileReady: (id: string) => request<void>(`/api/v1/printers/${id}/file-ready/clear`, { method: 'POST' }),
    },

    ams: {
        setSlot: (id: string, input: AmsSetSlotInput) => request<void>(`/api/v1/printers/${id}/ams/slot`, json(input)),
        feed: (id: string, input: AmsFeedInput) => request<void>(`/api/v1/printers/${id}/ams/feed`, json(input)),
        autoFeed: (id: string, input: AceAutoFeedInput) =>
            request<void>(`/api/v1/printers/${id}/ace/auto-feed`, json(input)),
        dry: (id: string, input: AceDryInput) => request<void>(`/api/v1/printers/${id}/ace/dry`, json(input)),
    },

    printerFiles: {
        list: (id: string) => request<PrinterFileListDto>(`/api/v1/printers/${id}/printer-files`),
        remove: (id: string, filenames: string[]) =>
            request<void>(`/api/v1/printers/${id}/printer-files/delete`, json({ filenames })),
        print: (id: string, input: PrintPrinterFileInput) =>
            request<void>(`/api/v1/printers/${id}/printer-files/print`, json(input)),
        thumbnail: (id: string, filename: string) =>
            request<{ thumbnail: string }>(
                `/api/v1/printers/${id}/printer-files/thumbnail?filename=${encodeURIComponent(filename)}`,
            ),
    },

    settings: {
        get: () => request<AppSettings>('/api/v1/settings'),
        update: (input: UpdateAppSettingsInput) =>
            request<AppSettings>('/api/v1/settings', { method: 'PATCH', body: JSON.stringify(input) }),
    },

    detection: {
        status: () => request<FailureDetectionStatusDto>('/api/v1/detection'),
        printer: (id: string) => request<PrinterDetectionDto | null>(`/api/v1/printers/${id}/detection`),
        download: () => request<DetectionModelDto>('/api/v1/detection/model/download', { method: 'POST' }),
        cancelDownload: () => request<DetectionModelDto>('/api/v1/detection/model/cancel', { method: 'POST' }),
        deleteModel: () => request<DetectionModelDto>('/api/v1/detection/model', { method: 'DELETE' }),
    },

    spoolman: {
        spools: () => request<SpoolmanSpool[]>('/api/v1/spoolman/spools'),
        health: () => request<{ reachable: boolean; configured: boolean; pending?: number }>('/api/v1/spoolman/health'),
        status: (id: string) => request<SpoolmanStatus>(`/api/v1/printers/${id}/spoolman`),
        setSlots: (id: string, slotMap: Record<string, number>) =>
            request<{ slotSpools: Record<string, number> }>(`/api/v1/printers/${id}/spoolman/slots`, json({ slotMap })),
    },

    logs: {
        downloadUrl: '/api/v1/logs/download',
    },

    events: {
        recent: () => request<KobralinkEvent[]>('/api/v1/notifications'),
        test: () =>
            request<{ delivered: string[]; failed: { channel: string; error: string }[] }>(
                '/api/v1/notifications/test',
                {
                    method: 'POST',
                },
            ),
    },

    spools: {
        list: (archived = false) => request<LocalSpoolDto[]>(`/api/v1/spools?archived=${archived}`),
        create: (input: LocalSpoolInput) => request<LocalSpoolDto>('/api/v1/spools', json(input)),
        update: (id: string, input: UpdateLocalSpoolInput) =>
            request<LocalSpoolDto>(`/api/v1/spools/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/api/v1/spools/${id}`, { method: 'DELETE' }),
        assignments: (printerId: string) =>
            request<{ slotSpools: Record<string, string> }>(`/api/v1/printers/${printerId}/spools`),
        assign: (printerId: string, slotMap: Record<string, string | null>) =>
            request<{ slotSpools: Record<string, string> }>(`/api/v1/printers/${printerId}/spools`, json({ slotMap })),
    },

    timelapses: {
        list: (printerId?: string) =>
            request<TimelapseDto[]>(printerId ? `/api/v1/printers/${printerId}/timelapses` : '/api/v1/timelapses'),
        remove: (id: string) => request<void>(`/api/v1/timelapses/${id}`, { method: 'DELETE' }),
        videoUrl: (id: string) => `/api/v1/timelapses/${id}/video`,
        posterUrl: (id: string) => `/api/v1/timelapses/${id}/poster`,
    },

    stats: (printerId?: string, days = 0) =>
        request<StatsDto>(`/api/v1/stats?printerId=${encodeURIComponent(printerId ?? '')}&days=${days}`),
    statsCsvUrl: (printerId?: string, days = 0) =>
        `/api/v1/stats/export.csv?printerId=${encodeURIComponent(printerId ?? '')}&days=${days}`,

    queue: {
        all: () => request<QueueItemDto[]>('/api/v1/queue'),
        list: (printerId: string) => request<QueueItemDto[]>(`/api/v1/printers/${printerId}/queue`),
        status: (printerId: string) => request<QueueStatusDto>(`/api/v1/printers/${printerId}/queue/status`),
        cancelAutoStart: (printerId: string) =>
            request<QueueStatusDto>(`/api/v1/printers/${printerId}/queue/auto-start`, { method: 'DELETE' }),
        bedClear: (printerId: string, outcome: 'good' | 'bad' = 'good') =>
            request<BedClearResultDto>(`/api/v1/printers/${printerId}/queue/bed-clear`, json({ outcome })),
        maintenance: (printerId: string, enabled: boolean) =>
            request<QueueStatusDto>(`/api/v1/printers/${printerId}/queue/maintenance`, json({ enabled })),
        add: (input: AddQueueItemInput) => request<QueueItemDto>('/api/v1/queue', json(input)),
        check: (input: QueueCheckInput) => request<QueueCheckDto>('/api/v1/queue/check', json(input)),
        reorder: (ids: string[]) => request<QueueItemDto[]>('/api/v1/queue/reorder', json({ ids })),
        start: (printerId: string) =>
            request<QueueItemDto>(`/api/v1/printers/${printerId}/queue/start`, { method: 'POST' }),
        remove: (itemId: string) => request<void>(`/api/v1/queue/${itemId}`, { method: 'DELETE' }),
        clear: (printerId?: string) =>
            request<void>(printerId ? `/api/v1/printers/${printerId}/queue` : '/api/v1/queue', { method: 'DELETE' }),
    },

    homeAssistant: {
        test: (input: HomeAssistantTestInput) => request<HaTestResultDto>('/api/v1/home-assistant/test', json(input)),
        energySensors: () => request<HaEnergySensorDto[]>('/api/v1/home-assistant/energy-sensors'),
        switches: () => request<HaSwitchDto[]>('/api/v1/home-assistant/switches'),
    },
    automations: {
        list: () => request<AutomationRuleDto[]>('/api/v1/automations'),
        create: (input: AutomationRuleInput) => request<AutomationRuleDto>('/api/v1/automations', json(input)),
        update: (id: string, input: AutomationRuleInput) =>
            request<AutomationRuleDto>(`/api/v1/automations/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
        setEnabled: (id: string, enabled: boolean) =>
            request<AutomationRuleDto>(`/api/v1/automations/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ enabled }),
            }),
        run: (id: string, printerId: string) =>
            request<AutomationRuleDto>(`/api/v1/automations/${id}/run`, json({ printerId })),
        remove: (id: string) => request<void>(`/api/v1/automations/${id}`, { method: 'DELETE' }),
    },
    macros: {
        list: () => request<MacroDto[]>('/api/v1/macros'),
        create: (input: MacroInput) => request<MacroDto>('/api/v1/macros', json(input)),
        update: (id: string, input: MacroInput) =>
            request<MacroDto>(`/api/v1/macros/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/api/v1/macros/${id}`, { method: 'DELETE' }),
        reorder: (ids: string[]) => request<MacroDto[]>('/api/v1/macros/reorder', json({ ids })),
        run: (printerId: string, macroId: string) =>
            request<void>(`/api/v1/printers/${printerId}/macros/${macroId}/run`, { method: 'POST' }),
    },

    schedule: {
        list: (printerId: string) => request<ScheduledPrintDto[]>(`/api/v1/printers/${printerId}/schedule`),
        create: (printerId: string, input: SchedulePrintInput) =>
            request<ScheduledPrintDto>(`/api/v1/printers/${printerId}/schedule`, json(input)),
        remove: (printerId: string, id: string) =>
            request<void>(`/api/v1/printers/${printerId}/schedule/${id}`, { method: 'DELETE' }),
    },

    maintenance: {
        list: (printerId: string) => request<MaintenanceTaskDto[]>(`/api/v1/printers/${printerId}/maintenance`),
        create: (printerId: string, input: MaintenanceTaskInput) =>
            request<MaintenanceTaskDto>(`/api/v1/printers/${printerId}/maintenance`, json(input)),
        update: (printerId: string, id: string, input: MaintenanceTaskInput) =>
            request<MaintenanceTaskDto>(`/api/v1/printers/${printerId}/maintenance/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(input),
            }),
        complete: (printerId: string, id: string, input: CompleteMaintenanceInput) =>
            request<MaintenanceTaskDto>(`/api/v1/printers/${printerId}/maintenance/${id}/done`, json(input)),
        logs: (printerId: string, id: string) =>
            request<MaintenanceLogDto[]>(`/api/v1/printers/${printerId}/maintenance/${id}/log`),
        remove: (printerId: string, id: string) =>
            request<void>(`/api/v1/printers/${printerId}/maintenance/${id}`, { method: 'DELETE' }),
    },

    drySchedule: {
        list: (printerId: string) => request<ScheduledDryDto[]>(`/api/v1/printers/${printerId}/dry-schedule`),
        create: (printerId: string, input: ScheduleDryInput) =>
            request<ScheduledDryDto>(`/api/v1/printers/${printerId}/dry-schedule`, json(input)),
        remove: (printerId: string, id: string) =>
            request<void>(`/api/v1/printers/${printerId}/dry-schedule/${id}`, { method: 'DELETE' }),
    },

    users: {
        list: () => request<UserDto[]>('/api/v1/users'),
        create: (input: CreateUserInput) => request<UserDto>('/api/v1/users', json(input)),
        update: (id: string, input: UpdateUserInput) =>
            request<UserDto>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
        remove: (id: string) => request<void>(`/api/v1/users/${id}`, { method: 'DELETE' }),
    },

    system: {
        info: () => request<SystemInfoDto>('/api/v1/system'),
        checkUpdate: () => request<SystemInfoDto['update']>('/api/v1/system/update-check', { method: 'POST' }),
        backupInfo: () => request<BackupInfoDto>('/api/v1/system/backup/info'),
        backupUrl: (timelapses: boolean) => `/api/v1/system/backup?timelapses=${timelapses}`,
        restore: (file: File) => {
            const fd = new FormData();
            fd.append('file', file, file.name);
            return request<{ files: number; restarting: boolean }>('/api/v1/system/restore', {
                method: 'POST',
                body: fd,
            });
        },
        restart: () => request<{ restarting: boolean }>('/api/v1/system/restart', { method: 'POST' }),
    },

    skip: {
        state: (id: string) => request<SkipStateDto>(`/api/v1/printers/${id}/skip/state`),
        query: (id: string) => request<SkipStateDto>(`/api/v1/printers/${id}/skip/query`, { method: 'POST' }),
        apply: (id: string, names: string[]) => request<void>(`/api/v1/printers/${id}/skip`, json({ names })),
    },

    filament: {
        profiles: () => request<FilamentProfile[]>('/api/v1/filament/profiles'),
        vendors: () => request<string[]>('/api/v1/filament/vendors'),
        userProfiles: () => request<FilamentProfile[]>('/api/v1/filament/profiles/user'),
        importProfiles: (files: File[]) => {
            const fd = new FormData();
            for (const f of files) fd.append('files', f, f.name);
            return request<ImportProfilesResult>('/api/v1/filament/profiles/user', { method: 'POST', body: fd });
        },
        deleteUserProfile: (vendor: string, name: string) =>
            request<{ removed: number; totalUser: number }>(
                `/api/v1/filament/profiles/user?vendor=${encodeURIComponent(vendor)}&name=${encodeURIComponent(name)}`,
                { method: 'DELETE' },
            ),
        slots: (id: string) => request<SlotFilamentInfo[]>(`/api/v1/printers/${id}/filament/slots`),
        setSlotProfile: (id: string, slotIndex: number, input: SetSlotProfileInput) =>
            request<{ slotIndex: number; profile: SlotProfileRef | null }>(
                `/api/v1/printers/${id}/filament/slots/${slotIndex}/profile`,
                json(input),
            ),
    },

    camera: {
        start: (id: string) => request<{ state: string }>(`/api/v1/printers/${id}/camera/start`, { method: 'POST' }),
        stop: (id: string) => request<void>(`/api/v1/printers/${id}/camera/stop`, { method: 'POST' }),
        reset: (id: string) => request<void>(`/api/v1/printers/${id}/camera/reset`, { method: 'POST' }),
        streamUrl: (id: string) => `/api/v1/printers/${id}/camera/stream`,
        snapshotUrl: (id: string) => `/api/v1/printers/${id}/camera/snapshot`,
    },

    files: {
        all: () => request<GcodeFileDto[]>('/api/v1/files'),
        list: (id: string) => request<GcodeFileDto[]>(`/api/v1/printers/${id}/files`),
        historyAll: (printerId?: string, limit = 100) =>
            request<PrintJobDto[]>(`/api/v1/history?printerId=${encodeURIComponent(printerId ?? '')}&limit=${limit}`),
        upload: (id: string, file: File, print: boolean) => {
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('print', String(print));
            return request<GcodeFileDto>(`/api/v1/printers/${id}/files`, { method: 'POST', body: fd });
        },
        print: (id: string, input: StartPrintInput) =>
            request<GcodeFileDto>(`/api/v1/printers/${id}/print`, json(input)),
        objects: (id: string, fileId: string) =>
            request<FileObjectsDto>(`/api/v1/printers/${id}/files/${fileId}/objects`),
        remove: (id: string, fileId: string) =>
            request<void>(`/api/v1/printers/${id}/files/${fileId}`, { method: 'DELETE' }),
        verify: (id: string, fileId: string) =>
            request<void>(`/api/v1/printers/${id}/files/${fileId}/verify`, { method: 'POST' }),
        downloadUrl: (id: string, fileId: string) => `/api/v1/printers/${id}/files/${fileId}/download`,
        history: (id: string, limit = 50) => request<PrintJobDto[]>(`/api/v1/printers/${id}/history?limit=${limit}`),
        updateJob: (id: string, jobId: string, input: UpdatePrintJobInput) =>
            request<PrintJobDto>(`/api/v1/printers/${id}/history/${jobId}`, {
                method: 'PATCH',
                body: JSON.stringify(input),
            }),
        snapshotUrl: (id: string, jobId: string) => `/api/v1/printers/${id}/history/${jobId}/snapshot`,
    },
};
