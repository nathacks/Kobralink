import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt';
import { KobraProtocolError } from './errors';
import type { KobraInfoData, KobraMessage, KobraMultiColorBoxData, KobraPrintData, KobraSkipData } from './types';

export interface KobraLogger {
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
}

export interface KobraMqttOptions {
    host: string;
    port?: number;
    username: string;
    password: string;
    modeId: string;
    deviceId: string;

    cert: Buffer | string;

    key: Buffer | string;
    clientId?: string;
    connectTimeoutMs?: number;
    logger?: KobraLogger;
}

interface PendingRequest {
    msgid: string;
    resolve: (msg: KobraMessage | null) => void;
    timer: NodeJS.Timeout;
    reportKey: string;
    reportRegistered: boolean;
}

export type KobraReportSuffix =
    | 'info/report'
    | 'status/report'
    | 'print/report'
    | 'tempature/report'
    | 'multiColorBox/report'
    | 'light/report'
    | 'file/report'
    | 'buried/report'
    | 'skip/report'
    | 'fan/report'
    | 'video/report'
    | (string & {});

export interface KobraMqttEvents {
    connected: [];
    disconnected: [reason: string];
    error: [err: Error];
    report: [suffix: KobraReportSuffix, payload: KobraMessage];
}

const noopLogger: KobraLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

function usesBoringSsl(): boolean {
    return Boolean(process.versions.bun || process.versions.electron);
}

export class KobraMqttClient extends EventEmitter<KobraMqttEvents> {
    private client: MqttClient | null = null;
    private readonly pendingByMsgId = new Map<string, PendingRequest>();
    private readonly pendingByReport = new Map<string, PendingRequest>();
    private readonly log: KobraLogger;
    private wantConnected = false;

    constructor(private readonly opts: KobraMqttOptions) {
        super();
        this.log = opts.logger ?? noopLogger;
    }

    get connected(): boolean {
        return this.client?.connected === true;
    }

    private topic(kind: 'slicer' | 'web', type: string): string {
        return `anycubic/anycubicCloud/v1/${kind}/printer/${this.opts.modeId}/${this.opts.deviceId}/${type}`;
    }

    private get subscribeTopic(): string {
        return `anycubic/anycubicCloud/v1/printer/public/${this.opts.modeId}/${this.opts.deviceId}/#`;
    }

    async connect(): Promise<void> {
        if (this.client) await this.disconnect();
        this.wantConnected = true;
        const timeoutMs = this.opts.connectTimeoutMs ?? 8000;

        const options: IClientOptions = {
            protocol: 'mqtts',
            host: this.opts.host,
            port: this.opts.port ?? 9883,
            clientId: this.opts.clientId ?? 'kobrax_node',
            username: this.opts.username,
            password: this.opts.password,
            protocolVersion: 4,
            clean: true,
            keepalive: 60,
            connectTimeout: timeoutMs,
            reconnectPeriod: 0,
            resubscribe: false,
            cert: this.opts.cert,
            key: this.opts.key,
            rejectUnauthorized: false,
            ...(usesBoringSsl() ? {} : { ciphers: 'DEFAULT:@SECLEVEL=0' }),
            minVersion: 'TLSv1.2',
            checkServerIdentity: () => undefined,
        } as IClientOptions;

        const client = mqtt.connect(options);
        this.client = client;

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const onConnect = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };
            const onError = (err: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                client.end(true);
                this.client = null;
                reject(err);
            };
            const onClose = () => {
                if (settled) return;
                settled = true;
                cleanup();
                this.client = null;
                reject(new KobraProtocolError('mqtt_closed_handshake', {}, 'MQTT connection closed during handshake'));
            };
            const cleanup = () => {
                client.off('connect', onConnect);
                client.off('error', onError);
                client.off('close', onClose);
            };
            client.on('connect', onConnect);
            client.on('error', onError);
            client.on('close', onClose);
        });

        client.on('message', (topic, payload) => this.onMessage(topic, payload));
        client.on('error', (err) => {
            this.log.warn(`MQTT error: ${err.message}`);
            this.emit('error', err);
        });
        client.on('close', () => {
            this.failAllPending();
            if (this.client === client) this.client = null;
            this.emit('disconnected', this.wantConnected ? 'closed' : 'requested');
        });

        await new Promise<void>((resolve, reject) => {
            client.subscribe(this.subscribeTopic, { qos: 0 }, (err) => (err ? reject(err) : resolve()));
        });
        this.log.info(`MQTT connected to ${this.opts.host}:${this.opts.port ?? 9883}`);
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.wantConnected = false;
        const client = this.client;
        this.client = null;
        this.failAllPending();
        if (!client) return;
        await new Promise<void>((resolve) => client.end(true, {}, () => resolve()));
    }

    private failAllPending(): void {
        for (const p of this.pendingByMsgId.values()) {
            clearTimeout(p.timer);
            p.resolve(null);
        }
        this.pendingByMsgId.clear();
        this.pendingByReport.clear();
    }

    private onMessage(topic: string, raw: Buffer): void {
        let payload: KobraMessage;
        try {
            payload = JSON.parse(raw.toString('utf8'));
        } catch {
            this.log.debug(`MQTT: non-JSON payload on ${topic}`);
            return;
        }
        if (!payload || typeof payload !== 'object') return;
        const suffix = topic.split('/').slice(-2).join('/') as KobraReportSuffix;
        this.log.debug(`RX ${suffix} state=${payload.state ?? ''} action=${payload.action ?? ''}`);

        const msgid = payload.msgid;
        const byReport = this.pendingByReport.get(suffix);
        if (byReport && (!msgid || byReport.msgid === msgid)) {
            this.settle(byReport, payload);
        }
        if (msgid) {
            const byId = this.pendingByMsgId.get(msgid);
            if (byId) this.settle(byId, payload);
        }
        this.emit('report', suffix, payload);
    }

    private settle(p: PendingRequest, payload: KobraMessage | null): void {
        clearTimeout(p.timer);
        this.pendingByMsgId.delete(p.msgid);
        if (p.reportRegistered && this.pendingByReport.get(p.reportKey) === p) {
            this.pendingByReport.delete(p.reportKey);
        }
        p.resolve(payload);
    }

    private buildPayload(type: string, action: string, data: unknown, msgid: string): string {
        return JSON.stringify({
            type,
            action,
            msgid,
            timestamp: Date.now(),
            data: data ?? null,
        });
    }

    request<T = unknown>(
        type: string,
        action: string,
        data?: unknown,
        timeoutMs = 5000,
    ): Promise<KobraMessage<T> | null> {
        const client = this.client;
        if (!client?.connected) return Promise.resolve(null);
        const msgid = randomUUID();
        const reportKey = `${type}/report`;
        const body = this.buildPayload(type, action, data, msgid);
        const level = action === 'query' || action === 'getInfo' ? 'debug' : 'info';
        this.log[level](`TX ${type}/request action=${action} data=${data ? JSON.stringify(data) : 'null'}`);

        return new Promise<KobraMessage<T> | null>((resolve) => {
            const pending: PendingRequest = {
                msgid,
                resolve: resolve as (m: KobraMessage | null) => void,
                reportKey,
                reportRegistered: false,
                timer: setTimeout(() => this.settle(pending, null), Math.max(timeoutMs, 1)),
            };
            this.pendingByMsgId.set(msgid, pending);
            if (!this.pendingByReport.has(reportKey)) {
                this.pendingByReport.set(reportKey, pending);
                pending.reportRegistered = true;
            }
            client.publish(this.topic('slicer', type), body, { qos: 0 }, (err) => {
                if (err) {
                    this.log.warn(`MQTT publish failed: ${err.message}`);
                    this.settle(pending, null);
                }
            });
        });
    }

    send(type: string, action: string, data?: unknown): void {
        const client = this.client;
        if (!client?.connected) return;
        this.log.info(`TX ${type}/request action=${action} data=${data ? JSON.stringify(data) : 'null'}`);
        client.publish(this.topic('slicer', type), this.buildPayload(type, action, data, randomUUID()));
    }

    publishWeb(type: string, action: string, data?: unknown): void {
        const client = this.client;
        if (!client?.connected) return;
        this.log.info(`TX(web) ${type}/request action=${action} data=${data ? JSON.stringify(data) : 'null'}`);
        client.publish(this.topic('web', type), this.buildPayload(type, action, data, randomUUID()));
    }

    queryInfo() {
        return this.request<KobraInfoData>('info', 'query');
    }

    queryStatus() {
        return this.request('status', 'query');
    }

    queryPrint(timeoutMs = 3000) {
        return this.request<KobraPrintData>('print', 'query', undefined, timeoutMs);
    }

    queryMultiColorBox() {
        return this.request<KobraMultiColorBoxData>('multiColorBox', 'getInfo');
    }

    pausePrint(taskid = '-1') {
        return this.request('print', 'pause', { taskid });
    }

    resumePrint(taskid = '-1') {
        return this.request('print', 'resume', { taskid });
    }

    stopPrint(taskid = '-1') {
        return this.request('print', 'stop', { taskid });
    }

    startCamera() {
        return this.request('video', 'startCapture', undefined, 8000);
    }

    stopCamera() {
        return this.request('video', 'stopCapture');
    }

    setFan(pct: number) {
        this.send('fan', 'setSpeed', { fan_speed_pct: pct });
    }

    setLight(on: boolean, brightness = 80) {
        this.send('light', 'control', { type: 3, status: on ? 1 : 0, brightness });
    }

    setPrintSpeedMode(taskid: string, mode: number) {
        this.publishWeb('print', 'update', { taskid, settings: { print_speed_mode: mode } });
    }

    setIdleTemperature(nozzle?: number, bed?: number) {
        if (nozzle !== undefined && bed !== undefined) {
            this.publishWeb('tempature', 'set', {
                type: 2,
                target_nozzle_temp: Math.round(nozzle),
                target_hotbed_temp: Math.round(bed),
            });
        } else if (nozzle !== undefined) {
            this.publishWeb('tempature', 'set', {
                type: 0,
                target_nozzle_temp: Math.round(nozzle),
                target_hotbed_temp: 0,
            });
        } else if (bed !== undefined) {
            this.publishWeb('tempature', 'set', {
                type: 1,
                target_nozzle_temp: 0,
                target_hotbed_temp: Math.round(bed),
            });
        }
    }

    setPrintingTemperature(taskid: string, nozzle?: number, bed?: number) {
        if (nozzle !== undefined) {
            this.publishWeb('print', 'update', {
                taskid,
                settings: { target_nozzle_temp: Math.round(nozzle) },
            });
        }
        if (bed !== undefined) {
            this.publishWeb('print', 'update', {
                taskid,
                settings: { target_hotbed_temp: Math.round(bed) },
            });
        }
    }

    moveAxis(axis: number, moveType: number, distance = 0) {
        this.send('axis', 'move', { axis, move_type: moveType, distance });
    }

    disableSteppers() {
        this.send('axis', 'turnOff');
    }

    setAmsSlotInfo(boxId: number, localSlot: number, type: string, color: [number, number, number]) {
        this.publishWeb('multiColorBox', 'setInfo', {
            multi_color_box: [{ id: boxId, slots: [{ index: localSlot, type, color }] }],
        });
    }

    feedFilament(boxId: number, localSlot: number, type: number) {
        this.send('multiColorBox', 'feedFilament', {
            multi_color_box: [{ id: boxId, feed_status: { slot_index: localSlot, type } }],
        });
    }

    setAutoFeed(aceId: number, on: boolean) {
        this.send('multiColorBox', 'setAutoFeed', { multi_color_box: [{ id: aceId, auto_feed: on ? 1 : 0 }] });
    }

    setDry(
        aceIds: number[],
        drying: { status: number; target_temp?: number; duration?: number; remain_time?: number },
    ) {
        this.send('multiColorBox', 'setDry', {
            multi_color_box: aceIds.map((id) => ({ id, drying_status: { ...drying } })),
        });
    }

    querySkipObjects() {
        return this.request<KobraSkipData>('skip', 'query_obj', undefined, 3000);
    }

    skipObjects(names: string[]) {
        return this.request<KobraSkipData>('skip', 'start', { objects_skip_parts: names }, 5000);
    }

    listLocalFiles() {
        this.send('file', 'listLocal', { page_num: 1, page_size: 1000, path: '/' });
    }

    deleteLocalFiles(filenames: string[]) {
        this.send('file', 'deleteBatch', {
            root: 'local',
            files: filenames.map((filename) => ({ path: '/', filename })),
        });
    }

    requestFileDetails(filename: string) {
        this.send('file', 'fileDetails', { root: 'local', filename });
    }

    startPrint(payload: unknown, timeoutMs = 15000) {
        return this.request('print', 'start', payload, timeoutMs);
    }
}
