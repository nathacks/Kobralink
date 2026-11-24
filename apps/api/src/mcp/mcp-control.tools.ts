import {
    AMS_MATERIALS,
    aceAutoFeedSchema,
    aceDrySchema,
    addQueueItemSchema,
    completeMaintenanceSchema,
    FAILURE_REASONS,
    maintenanceModeSchema,
    powerActionSchema,
    printerFilePath,
    reorderQueueSchema,
    scheduleDrySchema,
    schedulePrintSchema,
    setFanSchema,
    setLightSchema,
    setSpeedSchema,
    setTemperatureSchema,
    skipObjectsSchema,
    startPrintSchema,
    updatePrintJobSchema,
} from '@kobralink/shared';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AutomationService } from '../automations/automation.service';
import { BridgeRegistry } from '../bridge/bridge.registry';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { localIpFor } from '../common/net';
import { DryScheduleService } from '../dry/dry-schedule.service';
import { GcodeService } from '../gcode/gcode.service';
import { PowerService } from '../home-assistant/power.service';
import { m } from '../i18n/locale';
import { AXIS_ID, HOME_AXIS_ID, MacroService } from '../macros/macro.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { PrintersService } from '../printers/printers.service';
import { QueueService } from '../queue/queue.service';
import { ScheduledPrintService } from '../schedule/scheduled-print.service';
import { SpoolmanService } from '../spoolman/spoolman.service';
import { LocalSpoolService } from '../spools/local-spool.service';
import { defineTool, McpRefusal, type McpTool, printerInput } from './mcp-tool';

const START_COOLDOWN_MS = 30_000;
const MACRO_WAIT_MS = 10_000;
const IDLE_ONLY_ACTIONS = new Set(['home', 'move', 'motorsOff', 'feed', 'dry']);
const DESTRUCTIVE_HINT = 'Ask the user before calling.';
const IDLE_HINT = 'Refused while the printer prints or is paused.';

const onPrinter = <T extends z.ZodRawShape>(shape: T) => z.object({ ...printerInput.shape, ...shape });

const bedIsClear = z
    .literal(true)
    .describe('true only if the user confirmed in this conversation that the bed is empty and clean');
const slotIndex = z.number().int().min(0).max(19).describe('globalIndex of the slot, from list_filament_slots');
const startAt = schedulePrintSchema.shape.startAt.describe('ISO 8601 date and time with time zone');
const maintenanceNote = completeMaintenanceSchema.shape.note;

@Injectable()
export class McpControlTools {
    private readonly log = new Logger(McpControlTools.name);
    private readonly startedAt = new Map<string, number>();
    readonly tools: McpTool[];

    constructor(
        private readonly registry: BridgeRegistry,
        private readonly printers: PrintersService,
        private readonly gcode: GcodeService,
        private readonly power: PowerService,
        private readonly spools: LocalSpoolService,
        private readonly spoolman: SpoolmanService,
        private readonly queue: QueueService,
        private readonly schedule: ScheduledPrintService,
        private readonly drying: DryScheduleService,
        private readonly maintenance: MaintenanceService,
        private readonly macros: MacroService,
        private readonly automations: AutomationService,
    ) {
        this.tools = [
            ...this.printTools(),
            ...this.machineTools(),
            ...this.filamentTools(),
            ...this.queueTools(),
            ...this.scheduleTools(),
            ...this.otherTools(),
        ];
    }

    private idle(printerId: string): PrinterBridge {
        const bridge = this.registry.get(printerId);
        const { printState } = bridge.snapshot();
        if (printState === 'printing' || printState === 'paused') {
            throw new McpRefusal(`Refused: ${bridge.config.name} is ${printState}.`);
        }
        if (Date.now() - (this.startedAt.get(printerId) ?? 0) < START_COOLDOWN_MS) {
            throw new McpRefusal(`Refused: a print is starting on ${bridge.config.name}.`);
        }
        return bridge;
    }

    private async start<T>(printerId: string, launch: (bridge: PrinterBridge) => Promise<T>): Promise<T> {
        const bridge = this.idle(printerId);
        this.startedAt.set(printerId, Number.POSITIVE_INFINITY);
        try {
            const row = await this.printers.findOne(printerId);
            if (row.maintenance) throw new McpRefusal(`Refused: ${row.name} is in maintenance mode.`);
            const out = await launch(bridge);
            this.startedAt.set(printerId, Date.now());
            return out;
        } catch (e) {
            this.startedAt.delete(printerId);
            throw e;
        }
    }

    private serveBase(bridge: PrinterBridge): string {
        return `http://${localIpFor(bridge.config.ip)}:${bridge.config.httpPort}`;
    }

    private printTools(): McpTool[] {
        return [
            defineTool('control', {
                name: 'start_print',
                lock: 'always',
                title: 'Start a print',
                description: `Prints a stored G-code file now. ${IDLE_HINT} ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ ...startPrintSchema.shape, bedIsClear }),
                run: ({ printerId, fileId, bedIsClear: _clear, ...options }) =>
                    this.start(printerId, async (bridge) => {
                        const file = await bridge.printStoredFile(fileId, {
                            ...options,
                            serveBase: this.serveBase(bridge),
                        });
                        return { started: file.filename };
                    }),
            }),
            defineTool('control', {
                name: 'start_printer_file',
                lock: 'always',
                title: 'Start a file of the printer',
                description: `Prints a file from the internal storage of the printer (see list_printer_files). ${IDLE_HINT} ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({
                    filename: z.string().min(1).describe('Folder and name, for example test_model/cube.gcode'),
                    autoLeveling: z.boolean().optional(),
                    bedIsClear,
                }),
                run: ({ printerId, filename, autoLeveling }) =>
                    this.start(printerId, async (bridge) => {
                        const list = await bridge.listPrinterFiles();
                        const file = [...list.files, ...list.testModels].find((f) => printerFilePath(f) === filename);
                        if (!file) throw new McpRefusal(m.api_file_not_found());
                        await bridge.printPrinterFile(filename, file.sizeBytes, autoLeveling);
                        return { started: filename };
                    }),
            }),
            defineTool('control', {
                name: 'pause_print',
                title: 'Pause the print',
                description: 'Pauses the current print.',
                input: printerInput,
                run: ({ printerId }) => this.registry.get(printerId).pause(),
            }),
            defineTool('control', {
                name: 'resume_print',
                title: 'Resume the print',
                description: 'Resumes the paused print.',
                input: printerInput,
                run: ({ printerId }) => this.registry.get(printerId).resume(),
            }),
            defineTool('control', {
                name: 'cancel_print',
                title: 'Cancel the print',
                description: `Stops the current print for good. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ reason: z.enum(FAILURE_REASONS).optional() }),
                run: ({ printerId, reason }) => this.registry.get(printerId).cancel(reason ?? ''),
            }),
            defineTool('control', {
                name: 'skip_objects',
                title: 'Skip objects',
                description: `Stops printing some objects of the current print, cannot be undone. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter(skipObjectsSchema.shape),
                run: async ({ printerId, names }) => {
                    const bridge = this.registry.get(printerId);
                    const state = bridge.snapshot();
                    if (state.printState !== 'printing' && state.printState !== 'paused') {
                        throw new McpRefusal('Refused: nothing is printing.');
                    }
                    const file = state.filename ? await this.gcode.getByFilename(state.filename) : null;
                    const known = file ? ((await this.gcode.objects(file.id))?.names ?? []) : [];
                    const unknown = known.length ? names.filter((n) => !known.includes(n)) : [];
                    if (unknown.length) throw new McpRefusal(`Unknown objects: ${unknown.join(', ')}`);
                    await bridge.skipObjects(names);
                },
            }),
            defineTool('control', {
                name: 'set_print_speed',
                title: 'Set print speed',
                description: 'Speed mode of the current print: 1 silent, 2 normal, 3 sport.',
                input: onPrinter(setSpeedSchema.shape),
                run: ({ printerId, mode }) => this.registry.get(printerId).setSpeedMode(mode),
            }),
        ];
    }

    private machineTools(): McpTool[] {
        return [
            defineTool('control', {
                name: 'set_temperature',
                title: 'Set temperatures',
                description: `Target temperatures in °C, 0 turns the heater off. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter(setTemperatureSchema.shape),
                run: ({ printerId, nozzle, bed }) => {
                    if (nozzle === undefined && bed === undefined) throw new McpRefusal('Give nozzle or bed.');
                    this.registry.get(printerId).setTemperature(nozzle, bed);
                },
            }),
            defineTool('control', {
                name: 'set_fan',
                title: 'Set fan speed',
                description: 'Part cooling fan speed in percent.',
                input: onPrinter(setFanSchema.shape),
                run: ({ printerId, speed }) => this.registry.get(printerId).setFan(speed),
            }),
            defineTool('control', {
                name: 'set_light',
                title: 'Set light',
                description: 'Turns the printer light on or off.',
                input: onPrinter(setLightSchema.shape),
                run: ({ printerId, on, brightness }) => this.registry.get(printerId).setLight(on, brightness),
            }),
            defineTool('control', {
                name: 'home_axes',
                lock: 'always',
                title: 'Home axes',
                description: `Homes the axes. ${IDLE_HINT}`,
                input: onPrinter({ axis: z.enum(['all', 'xy', 'z']) }),
                run: ({ printerId, axis }) => this.idle(printerId).moveAxis(HOME_AXIS_ID[axis], 2, 0),
            }),
            defineTool('control', {
                name: 'move_axis',
                lock: 'always',
                title: 'Move an axis',
                description: `Moves one axis by a relative distance in mm. ${IDLE_HINT}`,
                input: onPrinter({ axis: z.enum(['x', 'y', 'z']), distance: z.number().min(-100).max(100) }),
                run: ({ printerId, axis, distance }) =>
                    this.idle(printerId).moveAxis(AXIS_ID[axis], distance >= 0 ? 1 : 0, Math.abs(distance)),
            }),
            defineTool('control', {
                name: 'disable_motors',
                lock: 'always',
                title: 'Disable motors',
                description: `Releases the stepper motors. ${IDLE_HINT}`,
                input: printerInput,
                run: ({ printerId }) => this.idle(printerId).disableSteppers(),
            }),
            defineTool('control', {
                name: 'set_power',
                lock: 'sometimes',
                title: 'Switch the smart plug',
                description: `Turns the smart plug of the printer on or off. Turning off is refused during a print. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter(powerActionSchema.shape),
                run: async ({ printerId, action }) => {
                    const bridge = this.registry.get(printerId);
                    if (!this.power.configured(bridge.settings)) throw new McpRefusal(m.api_no_plug());
                    if (action === 'off') {
                        this.idle(printerId);
                        if (await this.gcode.findOpenJob(printerId)) {
                            throw new McpRefusal('Refused: a print job is still open on this printer.');
                        }
                    }
                    await this.power.set(bridge.settings, action);
                    return { state: action };
                },
            }),
            defineTool('control', {
                name: 'set_printer_connection',
                title: 'Set printer connection',
                description: 'Connects, disconnects or reconnects Kobralink to the printer. Does not stop a print.',
                input: onPrinter({ action: z.enum(['connect', 'disconnect', 'reconnect']) }),
                run: async ({ printerId, action }) => {
                    const bridge = this.registry.get(printerId);
                    if (action === 'connect') bridge.connectManual();
                    else if (action === 'disconnect') await bridge.disconnectManual();
                    else await bridge.reconnectNow();
                },
            }),
        ];
    }

    private filamentTools(): McpTool[] {
        return [
            defineTool('control', {
                name: 'set_filament_slot',
                title: 'Set filament slot',
                description: 'Declares the material and color loaded in a slot.',
                input: onPrinter({
                    slotIndex,
                    material: z.enum(AMS_MATERIALS),
                    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                }),
                run: ({ printerId, slotIndex: index, material, colorHex }) => {
                    const value = Number.parseInt(colorHex.slice(1), 16);
                    this.registry
                        .get(printerId)
                        .amsSetSlot(index, material, [(value >> 16) & 255, (value >> 8) & 255, value & 255]);
                },
            }),
            defineTool('control', {
                name: 'feed_filament',
                lock: 'always',
                title: 'Load or unload filament',
                description: `Loads (in) or unloads (out) the filament of a slot. ${IDLE_HINT}`,
                input: onPrinter({ slotIndex, direction: z.enum(['in', 'out']) }),
                run: ({ printerId, slotIndex: index, direction }) =>
                    this.idle(printerId).amsFeed(index, direction === 'in' ? 1 : 2),
            }),
            defineTool('control', {
                name: 'set_auto_feed',
                title: 'Set ACE auto feed',
                description: 'Turns the automatic refill of an ACE unit on or off.',
                input: onPrinter(aceAutoFeedSchema.shape),
                run: ({ printerId, aceId, on }) => this.registry.get(printerId).aceAutoFeed(aceId, on),
            }),
            defineTool('control', {
                name: 'start_drying',
                lock: 'always',
                title: 'Start drying',
                description: `Starts drying filament in the ACE (°C, minutes). ${IDLE_HINT}`,
                input: onPrinter(aceDrySchema.omit({ action: true }).shape),
                run: ({ printerId, ...options }) => this.idle(printerId).aceDry('start', options),
            }),
            defineTool('control', {
                name: 'stop_drying',
                title: 'Stop drying',
                description: 'Stops drying filament in the ACE.',
                input: onPrinter({ aceId: aceDrySchema.shape.aceId }),
                run: ({ printerId, aceId }) =>
                    this.registry.get(printerId).aceDry('stop', { aceId, targetTemp: 0, duration: 0 }),
            }),
            defineTool('control', {
                name: 'assign_spool',
                title: 'Assign a spool',
                description: 'Assigns a spool of list_spools to a slot, or removes it when spoolId is null.',
                input: onPrinter({
                    slotIndex,
                    source: z.enum(['local', 'spoolman']),
                    spoolId: z.string().min(1).nullable(),
                }),
                run: async ({ printerId, slotIndex: index, source, spoolId }) => {
                    const bridge = this.registry.get(printerId);
                    if (source === 'local') {
                        return this.spools.setAssignments(printerId, { [String(index)]: spoolId });
                    }
                    const known = spoolId === null ? null : await this.spoolman.listSpools();
                    if (known && !known.some((s) => String(s.id) === spoolId)) throw new McpRefusal('Unknown spool.');
                    bridge.resetSpoolUsage();
                    return this.spoolman.setSlotMap(printerId, {
                        ...Object.fromEntries(this.spoolman.slotMap(printerId)),
                        [String(index)]: Number(spoolId ?? 0),
                    });
                },
            }),
        ];
    }

    private queueTools(): McpTool[] {
        return [
            defineTool('control', {
                name: 'add_to_queue',
                title: 'Add to the queue',
                description: `Adds a stored file to the print queue, for one printer, for tags or for any printer. It may start at once when auto-start is on. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: addQueueItemSchema,
                run: ({ fileId, excludedObjects, printerId, targetTags, ...options }) =>
                    this.queue.add(fileId, excludedObjects, false, options, {
                        printerId: printerId ?? null,
                        targetTags: printerId ? [] : (targetTags ?? []),
                    }),
            }),
            defineTool('control', {
                name: 'remove_from_queue',
                title: 'Remove from the queue',
                description: `Removes an item from the print queue. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: z.object({ itemId: z.string().min(1) }),
                run: ({ itemId }) => this.queue.remove(itemId),
            }),
            defineTool('control', {
                name: 'reorder_queue',
                title: 'Reorder the queue',
                description: 'Sets the order of the queue. Give every item id, first one printed first.',
                input: reorderQueueSchema,
                run: async ({ ids }) => {
                    const current = (await this.queue.list()).map((i) => i.id);
                    if (current.length !== new Set(ids).size || !current.every((id) => ids.includes(id))) {
                        throw new McpRefusal('Give every item id of get_queue exactly once.');
                    }
                    return this.queue.reorder(ids);
                },
            }),
            defineTool('control', {
                name: 'start_next_in_queue',
                lock: 'always',
                title: 'Start next in queue',
                description: `Starts the next item of the queue that fits the printer. ${IDLE_HINT} ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ bedIsClear }),
                run: ({ printerId }) => this.start(printerId, () => this.queue.startNext(printerId)),
            }),
            defineTool('control', {
                name: 'confirm_bed_clear',
                lock: 'always',
                title: 'Confirm the bed is clear',
                description: `Confirms the last print was removed, good or bad. The next print may start on its own. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ outcome: z.enum(['good', 'bad']).default('good'), bedIsClear }),
                run: ({ printerId, outcome }) => {
                    this.idle(printerId);
                    return this.queue.confirmBedClear(printerId, outcome);
                },
            }),
            defineTool('control', {
                name: 'cancel_queue_auto_start',
                title: 'Cancel queue auto-start',
                description: 'Cancels the countdown before the next print of the queue.',
                input: printerInput,
                run: ({ printerId }) => ({ cancelled: this.queue.cancelAutoStart(printerId) }),
            }),
            defineTool('control', {
                name: 'set_maintenance_mode',
                title: 'Set maintenance mode',
                description: `Maintenance mode stops the queue from starting prints. Turning it off may start the next one. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter(maintenanceModeSchema.shape),
                run: ({ printerId, enabled }) => this.queue.setMaintenance(printerId, enabled),
            }),
        ];
    }

    private scheduleTools(): McpTool[] {
        return [
            defineTool('control', {
                name: 'schedule_print',
                title: 'Schedule a print',
                description: `Starts a stored file at a given time, queued instead if the printer is busy. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ ...schedulePrintSchema.shape, startAt }),
                run: ({ printerId, ...input }) => this.schedule.create(printerId, input),
            }),
            defineTool('control', {
                name: 'cancel_scheduled_print',
                title: 'Cancel a scheduled print',
                description: `Removes a scheduled print. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ itemId: z.string().min(1) }),
                run: ({ printerId, itemId }) => this.schedule.remove(printerId, itemId),
            }),
            defineTool('control', {
                name: 'schedule_drying',
                title: 'Schedule drying',
                description: 'Starts drying filament at a given time (°C, minutes).',
                input: onPrinter({ ...scheduleDrySchema.shape, startAt }),
                run: ({ printerId, ...input }) => this.drying.create(printerId, input),
            }),
            defineTool('control', {
                name: 'cancel_scheduled_drying',
                title: 'Cancel scheduled drying',
                description: `Removes a scheduled drying. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ itemId: z.string().min(1) }),
                run: ({ printerId, itemId }) => this.drying.remove(printerId, itemId),
            }),
        ];
    }

    private otherTools(): McpTool[] {
        return [
            defineTool('control', {
                name: 'run_macro',
                lock: 'sometimes',
                title: 'Run a macro',
                description: `Runs a macro of list_macros. Macros that move, feed or dry are refused during a print. ${DESTRUCTIVE_HINT}`,
                destructive: true,
                input: onPrinter({ macroId: z.string().min(1) }),
                run: async ({ printerId, macroId }) => {
                    const macro = await this.macros.get(macroId);
                    const bridge = macro.actions.some((a) => IDLE_ONLY_ACTIONS.has(a.type))
                        ? this.idle(printerId)
                        : this.registry.get(printerId);
                    const run = this.macros.run(bridge, macro).then(() => ({ status: 'done' }));
                    let timer: NodeJS.Timeout | undefined;
                    const slow = new Promise<{ status: string }>((resolve) => {
                        timer = setTimeout(() => resolve({ status: 'still running' }), MACRO_WAIT_MS);
                    });
                    run.catch((e: Error) => this.log.warn(`Macro "${macro.name}": ${e.message}`));
                    return Promise.race([run, slow]).finally(() => clearTimeout(timer));
                },
            }),
            defineTool('control', {
                name: 'set_automation_enabled',
                title: 'Enable or disable an automation',
                description: 'Turns an automation rule of list_automations on or off.',
                input: z.object({ automationId: z.string().min(1), enabled: z.boolean() }),
                run: ({ automationId, enabled }) => this.automations.setEnabled(automationId, enabled),
            }),
            defineTool('control', {
                name: 'complete_maintenance_task',
                title: 'Complete a maintenance task',
                description: 'Marks a maintenance task as done now.',
                input: onPrinter({ taskId: z.string().min(1), note: maintenanceNote }),
                run: ({ printerId, taskId, note }) => this.maintenance.complete(printerId, taskId, { note }),
            }),
            defineTool('control', {
                name: 'annotate_print_job',
                title: 'Annotate a print job',
                description: 'Sets the note or the failure reason of a job of get_print_history.',
                input: onPrinter({ jobId: z.string().min(1), ...updatePrintJobSchema.shape }),
                run: async ({ printerId, jobId, ...patch }) => {
                    const job = await this.gcode.updateJob(printerId, jobId, patch);
                    if (!job) throw new McpRefusal('Unknown job.');
                    return job;
                },
            }),
        ];
    }
}
