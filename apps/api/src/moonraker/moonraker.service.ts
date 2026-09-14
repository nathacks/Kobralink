import type { AmsSlot } from '@kobralink/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { loadEnv } from '../config/env';
import { FilamentService } from '../filament/filament.service';
import {
    defaultFilamentName,
    GATE_TEMP,
    lookupFilamentId,
    materialFamily,
    normalizeMaterial,
    TRAY_INFO_IDX,
} from '../filament/filament-library';
import { GcodeService } from '../gcode/gcode.service';
import { MacroService } from '../macros/macro.service';
import { QueueService } from '../queue/queue.service';

export const PRINTER_BRIDGE = Symbol('PRINTER_BRIDGE');

export const MOONRAKER_VERSION = 'v0.9.3-1';
export const KLIPPER_VERSION = 'v0.12.0-1';

const STATIC_OBJECTS = new Set(['configfile', 'webhooks', 'heaters', 'history']);

@Injectable()
export class MoonrakerService {
    private readonly kv = new Map<string, Map<string, unknown>>();

    constructor(
        @Inject(PRINTER_BRIDGE) readonly bridge: PrinterBridge,
        readonly gcode: GcodeService,
        readonly filaments: FilamentService,
        readonly queue: QueueService,
        readonly macros: MacroService,
    ) {}

    private slotFilament(slot: AmsSlot): { material: string; name: string; vendor: string; trayInfoIdx: string } {
        const library = this.filaments.library();
        const raw = normalizeMaterial(slot.type || 'PLA');
        const { profile } = this.filaments.resolveSlot(this.bridge.id, slot.globalIndex, raw);
        if (profile?.name) {
            const type = library.find((p) => p.vendor === profile.vendor && p.name === profile.name)?.type ?? '';
            const material = materialFamily(type) || raw;
            return {
                material,
                name: profile.name,
                vendor: profile.vendor,
                trayInfoIdx: profile.id || TRAY_INFO_IDX[material] || 'OGFL99',
            };
        }
        const name = defaultFilamentName(raw, library);
        const vendor = name.startsWith('Generic ') ? 'Generic' : '';
        return {
            material: raw,
            name,
            vendor,
            trayInfoIdx: lookupFilamentId(library, vendor, name) || TRAY_INFO_IDX[raw] || 'OGFL99',
        };
    }

    get printerId(): string {
        return this.bridge.id;
    }

    serverInfo(wsCount = 0) {
        return {
            klippy_connected: true,
            klippy_state: 'ready',
            components: ['file_manager', 'job_state', 'job_queue', 'virtual_sdcard'],
            failed_components: [],
            registered_directories: ['gcodes'],
            warnings: [],
            websocket_count: wsCount,
            moonraker_version: MOONRAKER_VERSION,
            api_version: [1, 3, 0],
            api_version_string: '1.3.0',
        };
    }

    printerInfo() {
        return {
            state: 'ready',
            state_message: 'Printer is ready',
            hostname: 'kobralink-bridge',
            klipper_path: '/home/pi/klipper',
            python_path: '/home/pi/klippy-env/bin/python',
            log_file: '/tmp/klippy.log',
            config_file: '/home/pi/printer.cfg',
            software_version: KLIPPER_VERSION,
            cpu_info: this.bridge.snapshot().printerName,
        };
    }

    systemInfo() {
        return {
            system_info: {
                cpu_info: {
                    cpu_count: 4,
                    bits: '64bit',
                    processor: 'armv7l',
                    cpu_desc: 'Anycubic Kobra X Bridge',
                    serial_number: '',
                    hardware_desc: '',
                    model: 'Kobra X Bridge',
                    total_memory: 524288,
                    memory_units: 'kB',
                },
                sd_info: {},
                distribution: {
                    name: 'Linux',
                    id: 'linux',
                    version: '1.0',
                    version_parts: {},
                    like: '',
                    codename: '',
                },
                available_services: [],
                service_state: {},
                python: { version: [3, 12, 0], version_string: 'node' },
                network: {},
                canbus: {},
            },
        };
    }

    private mmuObject(slots: AmsSlot[], loaded: number): Record<string, unknown> {
        if (!slots.length) return {};
        const sorted = [...slots].sort((a, b) => a.globalIndex - b.globalIndex);
        const gateStatus: number[] = [];
        const gateMaterial: string[] = [];
        const gateColor: string[] = [];
        const gateTemp: number[] = [];
        const gateRgb: number[][] = [];
        const gateName: string[] = [];
        for (const s of sorted) {
            const occupied = s.status === 5;
            gateStatus.push(occupied ? 1 : 0);
            const info = occupied ? this.slotFilament(s) : null;
            const material = info?.material ?? '';
            gateMaterial.push(material);
            gateColor.push(occupied ? hex(s.color) : '');
            gateRgb.push(occupied ? s.color.map((c) => Math.round((c / 255) * 1000) / 1000) : [0, 0, 0]);
            gateTemp.push(occupied ? (GATE_TEMP[materialFamily(material)] ?? 210) : 0);
            gateName.push(info?.name ?? '');
        }
        const active = sorted.findIndex((s) => s.globalIndex === loaded);
        return {
            num_gates: sorted.length,
            enabled: true,
            gate_status: gateStatus,
            gate_material: gateMaterial,
            gate_color: gateColor,
            gate_temperature: gateTemp,
            gate_color_rgb: gateRgb,
            gate_filament_name: gateName,
            gate_spool_id: sorted.map(() => -1),
            ttg_map: sorted.map((_, i) => i),
            tool: active,
            gate: active,
        };
    }

    printerObjects(): Record<string, unknown> {
        const s = this.bridge.snapshot();
        const speedFactor = { 1: 0.5, 2: 1.0, 3: 1.3, 4: 1.5 }[s.printSpeedMode] ?? 1.0;
        return {
            extruder: { temperature: s.nozzleTemp, target: s.nozzleTarget, power: 0 },
            heater_bed: { temperature: s.bedTemp, target: s.bedTarget, power: 0 },
            print_stats: {
                state: s.printState,
                filename: s.filename,
                print_duration: s.printDurationSec,
                total_duration: s.printDurationSec,
                remain_time: s.remainTimeSec,
                info: { current_layer: s.currLayer, total_layer: s.totalLayers },
            },
            display_status: { progress: s.progress, message: '' },
            virtual_sdcard: {
                progress: s.progress,
                is_active: s.printState === 'printing',
                file_path: s.filename,
                file_position: s.progress ? Math.round(s.progress * 1_000_000) : 0,
            },
            toolhead: {
                position: [0, 0, s.zMm, 0],
                homed_axes: 'xyz',
                print_time: s.printDurationSec,
                estimated_print_time: s.printDurationSec,
            },
            mmu: this.mmuObject(s.amsSlots, s.amsLoadedSlot),
            heaters: {
                available_heaters: ['extruder', 'heater_bed'],
                available_sensors: [],
                available_monitors: [],
            },
            webhooks: { state: 'ready', state_message: 'Printer is ready' },
            gcode_move: {
                speed_factor: speedFactor,
                extrude_factor: 1.0,
                speed: 0,
                gcode_position: [0, 0, s.zMm, 0],
                absolute_coordinates: true,
                absolute_extrude: true,
                homing_origin: [0, 0, 0, 0],
                position: [0, 0, s.zMm, 0],
            },
            motion_report: {
                live_position: [0, 0, s.zMm, 0],
                live_velocity: 0,
                live_extruder_velocity: 0,
            },
            fan: { speed: s.fanSpeed / 100, rpm: null },
            history: {
                job_totals: {
                    total_jobs: 0,
                    total_time: 0,
                    total_print_time: 0,
                    total_filament_used: 0,
                    longest_job: 0,
                    longest_print: 0,
                },
                current_job: null,
            },
            'gcode_macro _OBICO_LAYER_CHANGE': {
                current_layer: s.currLayer,
                first_layer_scanning: false,
                first_layer_scan_enabled: false,
            },
            'gcode_macro TIMELAPSE_TAKE_FRAME': { is_paused: false },
            configfile: this.configfileStub(),
        };
    }

    liveObjects(): Record<string, unknown> {
        const all = this.printerObjects();
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(all)) if (!STATIC_OBJECTS.has(k)) out[k] = v;
        return out;
    }

    private configfileStub() {
        const cfg = {
            extruder: {
                min_temp: '0',
                max_temp: '320',
                min_extrude_temp: '170',
                nozzle_diameter: '0.400',
                filament_diameter: '1.750',
                max_extrude_only_distance: '500',
            },
            heater_bed: { min_temp: '0', max_temp: '120' },
            printer: {
                kinematics: 'corexy',
                max_velocity: '500',
                max_accel: '20000',
                max_z_velocity: '20',
                max_z_accel: '500',
            },
            stepper_x: { position_min: '0', position_max: '250' },
            stepper_y: { position_min: '0', position_max: '250' },
            stepper_z: { position_min: '0', position_max: '250' },
            fan: {},
            virtual_sdcard: { path: '~/gcode_files' },
            pause_resume: {},
            display_status: {},
            'gcode_macro PAUSE': {},
            'gcode_macro RESUME': {},
            'gcode_macro CANCEL_PRINT': {},
        };
        return { config: cfg, settings: cfg, save_config_pending: false, warnings: [] };
    }

    filterObjects(requested: string[] | Record<string, unknown> | undefined): Record<string, unknown> {
        const all = this.printerObjects();
        const keys = Array.isArray(requested) ? requested : requested ? Object.keys(requested) : [];
        if (!keys.length) return all;
        const out: Record<string, unknown> = {};
        for (const k of keys) if (k in all) out[k] = all[k];
        return out;
    }

    fileList() {
        const s = this.bridge.snapshot();
        return s.filename ? [{ path: s.filename, modified: Date.now() / 1000, size: 0, permissions: 'rw' }] : [];
    }

    fileMetadata(filename: string) {
        return this.bridge.fileMetadata(filename);
    }

    async historyList(limit = 50) {
        const jobs = await this.gcode.listJobs(this.bridge.id, limit);
        return {
            count: jobs.length,
            jobs: jobs.map((j) => {
                const start = Date.parse(j.startedAt) / 1000;
                return {
                    job_id: j.id,
                    exists: true,
                    filename: j.filename,
                    status: j.status === 'printing' ? 'in_progress' : j.status,
                    print_duration: j.durationSec ?? 0,
                    total_duration: j.durationSec ?? 0,
                    start_time: start,
                    end_time: j.finishedAt ? Date.parse(j.finishedAt) / 1000 : null,
                    filament_used: 0,
                    metadata: {},
                };
            }),
        };
    }

    webcams(baseUrl: string) {
        return {
            webcams: [
                {
                    name: 'Kobralink',
                    location: 'printer',
                    service: 'mjpegstreamer',
                    enabled: true,
                    stream_url: `${baseUrl}/api/camera/stream`,
                    snapshot_url: `${baseUrl}/api/camera/snapshot`,
                    flip_horizontal: false,
                    flip_vertical: false,
                    rotation: 0,
                    target_fps: 5,
                    target_fps_idle: 2,
                    aspect_ratio: '16:9',
                    extra_data: { h264_url: `${baseUrl}/api/camera/h264` },
                },
            ],
        };
    }

    laneData() {
        const slots = [...this.bridge.snapshot().amsSlots].sort((a, b) => a.globalIndex - b.globalIndex);
        if (!slots.length) return { ams: [], ams_exist_bits: '0', tray_exist_bits: '0' };
        const amsCount = Math.ceil(slots.length / 4);
        let amsBits = 0;
        let trayBits = 0;
        const ams: unknown[] = [];
        for (let amsId = 0; amsId < amsCount; amsId++) {
            amsBits |= 1 << amsId;
            const tray: unknown[] = [];
            for (let slotId = 0; slotId < 4; slotId++) {
                const idx = amsId * 4 + slotId;
                if (idx >= slots.length) break;
                const s = slots[idx];
                if (s.status === 5) {
                    trayBits |= 1 << idx;
                    const { material, name, vendor, trayInfoIdx } = this.slotFilament(s);
                    tray.push({
                        id: String(slotId),
                        tag_uid: '0000000000000000',
                        tray_info_idx: trayInfoIdx,
                        tray_type: material,
                        tray_color: `${hex(s.color)}FF`,
                        tray_sub_brands: vendor,
                        name,
                        vendor_name: vendor,
                        filament_id: trayInfoIdx,
                        filament_vendor: vendor,
                        filament_name: name,
                        preset: name,
                    });
                } else {
                    tray.push({
                        id: String(slotId),
                        tag_uid: '0000000000000000',
                        tray_info_idx: '',
                        tray_type: '',
                        tray_color: '00000000',
                        tray_slot_placeholder: '1',
                    });
                }
            }
            ams.push({ id: String(amsId), info: '0002', tray });
        }
        return {
            ams,
            ams_exist_bits: amsBits.toString(16).toUpperCase(),
            tray_exist_bits: trayBits.toString(16).toUpperCase(),
        };
    }

    databaseGet(namespace: string, key: string): { status: number; body: unknown } {
        if (namespace === 'lane_data') {
            return {
                status: 200,
                body: { result: { namespace, key: key || 'lanes', value: this.laneData() } },
            };
        }
        if (namespace === 'AFC' || namespace === 'afc-install' || namespace === 'happy_hare') {
            return { status: 200, body: { result: { namespace, key, value: null } } };
        }
        if (namespace === 'mainsail') {
            const value = key === 'presets' ? { presets: {} } : {};
            return { status: 200, body: { result: { namespace, key, value } } };
        }
        const store = this.kv.get(namespace);
        if (store) {
            const value = key ? (store.get(key) ?? null) : Object.fromEntries(store);
            return { status: 200, body: { result: { namespace, key, value } } };
        }
        if (namespace === 'obico') return { status: 200, body: { result: { namespace, key, value: key ? null : {} } } };
        return {
            status: 404,
            body: { error: { code: 404, message: `Namespace '${namespace}' not found` } },
        };
    }

    databaseSet(namespace: string, key: string, value: unknown) {
        let store = this.kv.get(namespace);
        if (!store) {
            store = new Map();
            this.kv.set(namespace, store);
        }
        store.set(key, value);
        return { result: { namespace, key, value } };
    }

    databaseList() {
        return {
            namespaces: ['lane_data', 'mainsail', 'obico', ...this.kv.keys()].filter((v, i, a) => a.indexOf(v) === i),
        };
    }

    async jobQueueStatus() {
        const items = await this.queue.list(this.bridge.id);
        return {
            queued_jobs: items.map((i) => ({
                filename: i.filename,
                job_id: i.id,
                time_added: new Date(i.createdAt).getTime() / 1000,
                time_in_queue: (Date.now() - new Date(i.createdAt).getTime()) / 1000,
            })),
            queue_state: this.bridge.settings.queueAutoStart ? 'ready' : 'paused',
        };
    }

    async execGcodeScript(script: string): Promise<string> {
        const s = (script ?? '').trim().toUpperCase();
        if (!s) return 'ok';
        const bridge = this.bridge;
        const macroName = s.split(/\s+/)[0] ?? '';
        const macro = await this.macros.findByName(macroName);
        if (macro) {
            await this.macros.run(bridge, macro).catch(() => undefined);
            return 'ok';
        }
        const marlinTemp = (line: string) => {
            const m = /S(\d+)/.exec(line);
            return m ? Number(m[1]) : undefined;
        };
        try {
            if (s === 'PAUSE' || s === 'M25') await bridge.pause();
            else if (s === 'RESUME' || s === 'M24') await bridge.resume();
            else if (['CANCEL_PRINT', 'M0', 'M1', 'M524', 'ABORT'].includes(s)) await bridge.cancel();
            else if (s.startsWith('M104 ')) {
                const t = marlinTemp(s);
                if (t !== undefined) bridge.setTemperature(t, undefined);
            } else if (s.startsWith('M140 ')) {
                const t = marlinTemp(s);
                if (t !== undefined) bridge.setTemperature(undefined, t);
            } else if (s.startsWith('SET_HEATER_TEMPERATURE')) {
                const heater = /HEATER=(\S+)/.exec(s)?.[1]?.toLowerCase();
                const target = /TARGET=([\d.]+)/.exec(s)?.[1];
                if (heater && target !== undefined) {
                    const t = Math.round(Number(target));
                    if (heater === 'extruder') bridge.setTemperature(t, undefined);
                    else if (heater === 'heater_bed' || heater === 'bed') bridge.setTemperature(undefined, t);
                }
            }
        } catch {}
        return 'ok';
    }

    uiUrl(): string {
        return `${loadEnv().baseUrl}/printers/${this.bridge.id}`;
    }
}

function hex(c: [number, number, number]): string {
    return c
        .map((v) =>
            Math.max(0, Math.min(255, Math.round(v)))
                .toString(16)
                .padStart(2, '0')
                .toUpperCase(),
        )
        .join('');
}
