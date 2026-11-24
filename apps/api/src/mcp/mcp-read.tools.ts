import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AutomationService } from '../automations/automation.service';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { DetectionService } from '../detection/detection.service';
import { DryScheduleService } from '../dry/dry-schedule.service';
import { FilamentService } from '../filament/filament.service';
import { GcodeService } from '../gcode/gcode.service';
import { PowerService } from '../home-assistant/power.service';
import { m } from '../i18n/locale';
import { MacroService } from '../macros/macro.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { NotificationService } from '../notifications/notification.service';
import { PrintersService } from '../printers/printers.service';
import { QueueService } from '../queue/queue.service';
import { ScheduledPrintService } from '../schedule/scheduled-print.service';
import { SpoolmanService } from '../spoolman/spoolman.service';
import { LocalSpoolService } from '../spools/local-spool.service';
import { StatsService } from '../stats/stats.service';
import { defineTool, McpImage, McpRefusal, type McpTool, printerInput } from './mcp-tool';

const MAX_SAMPLES = 120;

@Injectable()
export class McpReadTools {
    readonly tools: McpTool[];

    constructor(
        private readonly registry: BridgeRegistry,
        private readonly printers: PrintersService,
        private readonly gcode: GcodeService,
        private readonly power: PowerService,
        private readonly filaments: FilamentService,
        private readonly spools: LocalSpoolService,
        private readonly spoolman: SpoolmanService,
        private readonly queue: QueueService,
        private readonly schedule: ScheduledPrintService,
        private readonly drying: DryScheduleService,
        private readonly stats: StatsService,
        private readonly notifications: NotificationService,
        private readonly detection: DetectionService,
        private readonly maintenance: MaintenanceService,
        private readonly macros: MacroService,
        private readonly automations: AutomationService,
    ) {
        this.tools = [
            ...this.printerTools(),
            ...this.fileTools(),
            ...this.filamentTools(),
            ...this.queueTools(),
            ...this.activityTools(),
            ...this.automationTools(),
        ];
    }

    private printerTools(): McpTool[] {
        return [
            defineTool('read', {
                name: 'list_printers',
                title: 'List printers',
                description: 'All printers with their id, model, tags, connection and print state.',
                input: z.object({}),
                run: async () => {
                    const rows = await this.printers.findAll();
                    return rows.map((row) => {
                        const { profile } = PrintersService.parseSettings(row.settings);
                        const live = this.registry.has(row.id) ? this.registry.get(row.id).snapshot() : null;
                        return {
                            id: row.id,
                            name: row.name,
                            model: row.model,
                            location: profile.location,
                            tags: profile.tags,
                            nozzleMm: profile.nozzleMm,
                            maintenance: row.maintenance,
                            awaitingBedClear: row.awaitingBedClear,
                            connected: live?.connected ?? false,
                            printState: live?.printState ?? null,
                            kobraState: live?.kobraState ?? null,
                            filename: live?.filename ?? '',
                            progress: live?.progress ?? 0,
                        };
                    });
                },
            }),
            defineTool('read', {
                name: 'get_printer_state',
                title: 'Get printer state',
                description:
                    'Full live state: temperatures, progress, layers, remaining time, fan, light, filament slots, dryer, errors. progress is 0 to 1.',
                input: printerInput,
                run: ({ printerId }) => this.registry.get(printerId).snapshot(),
            }),
            defineTool('read', {
                name: 'get_temperature_history',
                title: 'Get temperature history',
                description: 'Recent nozzle and bed temperatures and progress, oldest first (t is a Unix time in ms).',
                input: printerInput,
                run: ({ printerId }) => {
                    const all = this.registry.get(printerId).samples();
                    const step = Math.ceil(all.length / MAX_SAMPLES) || 1;
                    return all.filter((_, i) => (all.length - 1 - i) % step === 0);
                },
            }),
            defineTool('read', {
                name: 'get_camera_snapshot',
                title: 'Get camera snapshot',
                description: 'Current camera image of the printer, as a JPEG.',
                input: printerInput,
                run: async ({ printerId }) => {
                    const { camera } = this.registry.get(printerId);
                    if (!camera.hasUrl) throw new McpRefusal(m.api_camera_no_url_short());
                    const frame = await camera.waitForFrame();
                    if (!frame) throw new McpRefusal(m.api_camera_no_frame());
                    return new McpImage(frame, 'image/jpeg');
                },
            }),
            defineTool('read', {
                name: 'get_power_state',
                title: 'Get smart plug state',
                description: 'State of the smart plug of the printer: on, off or unknown.',
                input: printerInput,
                run: async ({ printerId }) => {
                    const { settings } = this.registry.get(printerId);
                    const configured = this.power.configured(settings);
                    return { configured, state: configured ? await this.power.state(settings) : 'unknown' };
                },
            }),
        ];
    }

    private fileTools(): McpTool[] {
        return [
            defineTool('read', {
                name: 'list_files',
                title: 'List G-code files',
                description:
                    'G-code files stored in Kobralink, newest first. Use the id with start_print or add_to_queue.',
                input: z.object({
                    search: z.string().max(128).optional().describe('Part of the file name'),
                    limit: z.number().int().min(1).max(200).default(50),
                }),
                run: async ({ search, limit }) => {
                    const wanted = search?.toLowerCase() ?? '';
                    const files = (await this.gcode.list()).filter((f) => f.filename.toLowerCase().includes(wanted));
                    return {
                        total: files.length,
                        files: files
                            .slice(0, limit)
                            .map(({ objects, ...f }) => ({ ...f, objectCount: objects.length })),
                    };
                },
            }),
            defineTool('read', {
                name: 'get_file_objects',
                title: 'Get file objects',
                description: 'Names of the objects of a stored file, usable as excludedObjects or with skip_objects.',
                input: z.object({ fileId: z.string().min(1) }),
                run: async ({ fileId }) => {
                    const info = await this.gcode.objects(fileId);
                    if (!info) throw new McpRefusal(m.api_file_not_found());
                    return { filename: info.filename, objects: info.names };
                },
            }),
            defineTool('read', {
                name: 'list_printer_files',
                title: 'List files on the printer',
                description: 'Files in the internal storage of the printer, usable with start_printer_file.',
                input: printerInput,
                run: ({ printerId }) => this.registry.get(printerId).listPrinterFiles(),
            }),
        ];
    }

    private filamentTools(): McpTool[] {
        return [
            defineTool('read', {
                name: 'list_filament_slots',
                title: 'List filament slots',
                description: 'Filament slots of the printer with material, color, profile and assigned spool.',
                input: printerInput,
                run: ({ printerId }) => {
                    const state = this.registry.get(printerId).snapshot();
                    return {
                        mode: state.filamentMode,
                        loadedSlot: state.amsLoadedSlot,
                        slots: state.amsSlots,
                        profiles: this.filaments.slotInfos(printerId, state.amsSlots),
                        localSpools: this.spools.assignments(printerId),
                        spoolmanSpools: Object.fromEntries(this.spoolman.slotMap(printerId)),
                        aceUnits: state.aceUnits,
                    };
                },
            }),
            defineTool('read', {
                name: 'list_spools',
                title: 'List spools',
                description: 'Filament spools from Kobralink and, when configured, from Spoolman.',
                input: z.object({ includeArchived: z.boolean().default(false) }),
                run: async ({ includeArchived }) => ({
                    local: await this.spools.list(includeArchived),
                    spoolman: this.spoolman.configured ? await this.spoolman.listSpools() : null,
                }),
            }),
        ];
    }

    private queueTools(): McpTool[] {
        return [
            defineTool('read', {
                name: 'get_queue',
                title: 'Get print queue',
                description:
                    'Print queue in order with the reason each item waits, and the queue status of each printer.',
                input: z.object({}),
                run: async () => ({
                    items: await this.queue.list(),
                    printers: await Promise.all(
                        this.registry.list().map(async (b) => ({
                            printerId: b.id,
                            name: b.config.name,
                            ...(await this.queue.status(b.id)),
                        })),
                    ),
                }),
            }),
            defineTool('read', {
                name: 'check_queue_compatibility',
                title: 'Check queue compatibility',
                description: 'Tells which printers can print a file, and why the others cannot.',
                input: z.object({
                    fileId: z.string().min(1),
                    printerId: z.string().min(1).optional().describe('Only check this printer'),
                }),
                run: ({ fileId, printerId }) =>
                    this.queue.check(fileId, { printerId: printerId ?? null, targetTags: [] }),
            }),
            defineTool('read', {
                name: 'list_schedules',
                title: 'List schedules',
                description: 'Scheduled prints and scheduled filament drying of the printer.',
                input: printerInput,
                run: async ({ printerId }) => ({
                    prints: await this.schedule.list(printerId),
                    drying: await this.drying.list(printerId),
                }),
            }),
        ];
    }

    private activityTools(): McpTool[] {
        return [
            defineTool('read', {
                name: 'get_print_history',
                title: 'Get print history',
                description: 'Past print jobs, newest first, with duration, filament, cost and failure reason.',
                input: z.object({
                    printerId: z.string().min(1).optional(),
                    limit: z.number().int().min(1).max(200).default(20),
                    offset: z.number().int().min(0).default(0),
                }),
                run: ({ printerId, limit, offset }) => this.stats.history(printerId, limit, offset),
            }),
            defineTool('read', {
                name: 'get_stats',
                title: 'Get statistics',
                description: 'Print statistics: success rate, time, filament, costs, materials, failures.',
                input: z.object({
                    printerId: z.string().min(1).optional(),
                    days: z.number().int().min(0).max(3650).default(30).describe('Period in days, 0 for everything'),
                }),
                run: ({ printerId, days }) => this.stats.compute(printerId, days),
            }),
            defineTool('read', {
                name: 'get_recent_events',
                title: 'Get recent events',
                description: 'Latest notifications: prints started or finished, alerts, queue, maintenance.',
                input: z.object({}),
                run: () => this.notifications.recent(),
            }),
            defineTool('read', {
                name: 'get_detection_status',
                title: 'Get failure detection status',
                description: 'State of the AI print failure detection: model and score of each printer.',
                input: z.object({}),
                run: () => this.detection.status(),
            }),
            defineTool('read', {
                name: 'list_maintenance',
                title: 'List maintenance tasks',
                description:
                    'Maintenance tasks of the printer, with usage since the last time and whether they are due.',
                input: printerInput,
                run: ({ printerId }) => this.maintenance.list(printerId),
            }),
        ];
    }

    private automationTools(): McpTool[] {
        return [
            defineTool('read', {
                name: 'list_macros',
                title: 'List macros',
                description: 'Macros with their actions, usable with run_macro.',
                input: z.object({}),
                run: () => this.macros.list(),
            }),
            defineTool('read', {
                name: 'list_automations',
                title: 'List automations',
                description: 'Automation rules with trigger, actions and last run.',
                input: z.object({}),
                run: () => this.automations.list(),
            }),
        ];
    }
}
