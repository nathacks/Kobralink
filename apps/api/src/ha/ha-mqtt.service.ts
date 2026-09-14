import type { HaMqttSettings, PrinterLiveState } from '@kobralink/shared';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mqtt, { type MqttClient } from 'mqtt';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { SettingsService } from '../settings/settings.service';

const PUBLISH_THROTTLE_MS = 2000;

interface Attached {
    bridge: PrinterBridge;
    timer: NodeJS.Timeout | null;
    pending: PrinterLiveState | null;
    off: () => void;
    announced: boolean;
}

@Injectable()
export class HaMqttService implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(HaMqttService.name);
    private client: MqttClient | null = null;
    private cfg: HaMqttSettings | null = null;
    private readonly attached = new Map<string, Attached>();

    constructor(private readonly settings: SettingsService) {}

    onModuleInit(): void {
        this.apply(this.settings.get().haMqtt);
        this.settings.on('change', (s) => this.apply(s.haMqtt));
    }

    async onModuleDestroy(): Promise<void> {
        await this.disconnect();
    }

    get connected(): boolean {
        return this.client?.connected ?? false;
    }

    private apply(next: HaMqttSettings): void {
        const changed = JSON.stringify(next) !== JSON.stringify(this.cfg);
        if (!changed) return;
        this.cfg = next;
        void this.disconnect().then(() => {
            if (next.enabled && next.url) this.connect(next);
        });
    }

    private connect(cfg: HaMqttSettings): void {
        try {
            const client = mqtt.connect(cfg.url, {
                username: cfg.username || undefined,
                password: cfg.password || undefined,
                clientId: `kobralink-${Math.random().toString(16).slice(2, 8)}`,
                reconnectPeriod: 10_000,
                connectTimeout: 10_000,
                will: { topic: `${cfg.topicPrefix}/status`, payload: 'offline', retain: true, qos: 0 },
            });
            this.client = client;
            client.on('connect', () => {
                this.log.log(`Home Assistant MQTT connected (${cfg.url})`);
                client.publish(`${cfg.topicPrefix}/status`, 'online', { retain: true });
                for (const a of this.attached.values()) {
                    a.announced = false;
                    this.announce(a.bridge);
                    this.publishState(a.bridge, a.bridge.snapshot());
                }
                client.subscribe(`${cfg.topicPrefix}/+/cmd/#`);
            });
            client.on('message', (topic, payload) => this.onCommand(topic, payload.toString()));
            client.on('error', (e) => this.log.warn(`HA MQTT: ${e.message}`));
        } catch (e) {
            this.log.warn(`HA MQTT connect failed: ${(e as Error).message}`);
        }
    }

    private async disconnect(): Promise<void> {
        const c = this.client;
        this.client = null;
        if (!c) return;
        await new Promise<void>((resolve) => c.end(true, {}, () => resolve()));
    }

    attach(bridge: PrinterBridge): void {
        const entry: Attached = { bridge, timer: null, pending: null, off: () => undefined, announced: false };
        const onState = (state: PrinterLiveState) => {
            entry.pending = state;
            if (entry.timer) return;
            entry.timer = setTimeout(() => {
                entry.timer = null;
                if (entry.pending) this.publishState(bridge, entry.pending);
                entry.pending = null;
            }, PUBLISH_THROTTLE_MS);
        };
        bridge.on('state', onState);
        entry.off = () => bridge.off('state', onState);
        this.attached.set(bridge.id, entry);
        if (this.connected) {
            this.announce(bridge);
            this.publishState(bridge, bridge.snapshot());
        }
    }

    detach(printerId: string): void {
        const a = this.attached.get(printerId);
        if (!a) return;
        a.off();
        if (a.timer) clearTimeout(a.timer);
        this.attached.delete(printerId);
        if (this.client && this.cfg) {
            this.client.publish(`${this.cfg.topicPrefix}/${printerId}/availability`, 'offline', { retain: true });
        }
    }

    private topic(printerId: string, suffix: string): string {
        return `${this.cfg?.topicPrefix ?? 'kobralink'}/${printerId}/${suffix}`;
    }

    private announce(bridge: PrinterBridge): void {
        const client = this.client;
        const cfg = this.cfg;
        const entry = this.attached.get(bridge.id);
        if (!client || !cfg || !entry || entry.announced) return;
        entry.announced = true;
        const id = bridge.id;
        const device = {
            identifiers: [`kobralink_${id}`],
            name: bridge.config.name,
            manufacturer: 'Anycubic',
            model: 'Kobra X',
            sw_version: bridge.snapshot().firmwareVersion,
        };
        const availability = [{ topic: `${cfg.topicPrefix}/status` }, { topic: this.topic(id, 'availability') }];
        const state = this.topic(id, 'state');
        const base = (key: string, extra: Record<string, unknown>) => ({
            unique_id: `kobralink_${id}_${key}`,
            object_id: `${slug(bridge.config.name)}_${key}`,
            device,
            availability,
            availability_mode: 'all',
            state_topic: state,
            ...extra,
        });
        const sensors: [string, string, Record<string, unknown>][] = [
            [
                'state',
                'sensor',
                { name: 'State', value_template: '{{ value_json.kobraState }}', icon: 'mdi:printer-3d' },
            ],
            [
                'progress',
                'sensor',
                {
                    name: 'Progress',
                    value_template: '{{ (value_json.progress * 100) | round(1) }}',
                    unit_of_measurement: '%',
                    icon: 'mdi:progress-clock',
                },
            ],
            [
                'nozzle_temp',
                'sensor',
                {
                    name: 'Nozzle temperature',
                    value_template: '{{ value_json.nozzleTemp | round(1) }}',
                    unit_of_measurement: '°C',
                    device_class: 'temperature',
                    state_class: 'measurement',
                },
            ],
            [
                'nozzle_target',
                'sensor',
                {
                    name: 'Nozzle target',
                    value_template: '{{ value_json.nozzleTarget | round(0) }}',
                    unit_of_measurement: '°C',
                    device_class: 'temperature',
                },
            ],
            [
                'bed_temp',
                'sensor',
                {
                    name: 'Bed temperature',
                    value_template: '{{ value_json.bedTemp | round(1) }}',
                    unit_of_measurement: '°C',
                    device_class: 'temperature',
                    state_class: 'measurement',
                },
            ],
            [
                'bed_target',
                'sensor',
                {
                    name: 'Bed target',
                    value_template: '{{ value_json.bedTarget | round(0) }}',
                    unit_of_measurement: '°C',
                    device_class: 'temperature',
                },
            ],
            [
                'remaining',
                'sensor',
                {
                    name: 'Remaining time',
                    value_template: '{{ (value_json.remainTimeSec / 60) | round(0) }}',
                    unit_of_measurement: 'min',
                    device_class: 'duration',
                    icon: 'mdi:timer-sand',
                },
            ],
            [
                'elapsed',
                'sensor',
                {
                    name: 'Elapsed time',
                    value_template: '{{ (value_json.printDurationSec / 60) | round(0) }}',
                    unit_of_measurement: 'min',
                    device_class: 'duration',
                },
            ],
            [
                'layer',
                'sensor',
                {
                    name: 'Layer',
                    value_template: '{{ value_json.currLayer }}/{{ value_json.totalLayers }}',
                    icon: 'mdi:layers',
                },
            ],
            ['filename', 'sensor', { name: 'File', value_template: '{{ value_json.filename }}', icon: 'mdi:file' }],
            [
                'fan',
                'sensor',
                { name: 'Fan', value_template: '{{ value_json.fanSpeed }}', unit_of_measurement: '%', icon: 'mdi:fan' },
            ],
            [
                'connected',
                'binary_sensor',
                {
                    name: 'Connected',
                    value_template: '{{ "ON" if value_json.connected else "OFF" }}',
                    device_class: 'connectivity',
                },
            ],
            [
                'printing',
                'binary_sensor',
                {
                    name: 'Printing',
                    value_template: '{{ "ON" if value_json.printState == "printing" else "OFF" }}',
                    device_class: 'running',
                },
            ],
            [
                'light',
                'switch',
                {
                    name: 'Light',
                    value_template: '{{ "ON" if value_json.lightOn else "OFF" }}',
                    command_topic: this.topic(id, 'cmd/light'),
                    payload_on: 'ON',
                    payload_off: 'OFF',
                    icon: 'mdi:lightbulb',
                },
            ],
            ['pause', 'button', { name: 'Pause', command_topic: this.topic(id, 'cmd/pause'), icon: 'mdi:pause' }],
            ['resume', 'button', { name: 'Resume', command_topic: this.topic(id, 'cmd/resume'), icon: 'mdi:play' }],
            ['cancel', 'button', { name: 'Cancel', command_topic: this.topic(id, 'cmd/cancel'), icon: 'mdi:stop' }],
            ['camera', 'camera', { name: 'Camera', topic: this.topic(id, 'camera'), image_encoding: 'b64' }],
        ];
        for (const [key, component, extra] of sensors) {
            const payload = base(key, extra);
            if (component === 'button' || component === 'camera')
                delete (payload as { state_topic?: string }).state_topic;
            client.publish(
                `${cfg.discoveryPrefix}/${component}/kobralink_${id}/${key}/config`,
                JSON.stringify(payload),
                {
                    retain: true,
                },
            );
        }
        client.publish(this.topic(id, 'availability'), 'online', { retain: true });
    }

    private publishState(bridge: PrinterBridge, s: PrinterLiveState): void {
        const client = this.client;
        if (!client?.connected) return;
        this.announce(bridge);
        const payload = {
            connected: s.connected,
            kobraState: s.kobraState,
            printState: s.printState,
            progress: s.progress,
            nozzleTemp: s.nozzleTemp,
            nozzleTarget: s.nozzleTarget,
            bedTemp: s.bedTemp,
            bedTarget: s.bedTarget,
            remainTimeSec: s.remainTimeSec,
            printDurationSec: s.printDurationSec,
            currLayer: s.currLayer,
            totalLayers: s.totalLayers,
            filename: s.filename,
            fanSpeed: s.fanSpeed,
            lightOn: s.lightOn,
            pauseMsg: s.pauseMsg,
            errorCode: s.errorCode,
        };
        client.publish(this.topic(bridge.id, 'state'), JSON.stringify(payload), { retain: true });
        const jpeg = bridge.camera.latestJpeg;
        if (jpeg && s.printState === 'printing' && Date.now() - bridge.camera.latestJpegAt < 10_000) {
            client.publish(this.topic(bridge.id, 'camera'), jpeg.toString('base64'));
        }
    }

    private onCommand(topic: string, payload: string): void {
        const prefix = this.cfg?.topicPrefix ?? 'kobralink';
        const mtch = new RegExp(`^${escapeRe(prefix)}/([^/]+)/cmd/(.+)$`).exec(topic);
        if (!mtch) return;
        const entry = this.attached.get(mtch[1]);
        if (!entry) return;
        const bridge = entry.bridge;
        const cmd = mtch[2];
        try {
            if (cmd === 'light') bridge.setLight(payload.trim().toUpperCase() === 'ON');
            else if (cmd === 'pause') void bridge.pause();
            else if (cmd === 'resume') void bridge.resume();
            else if (cmd === 'cancel') void bridge.cancel();
        } catch (e) {
            this.log.warn(`HA command ${cmd} failed: ${(e as Error).message}`);
        }
    }
}

function slug(s: string): string {
    return (
        s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'printer'
    );
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
