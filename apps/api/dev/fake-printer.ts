import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { resolveFfmpeg } from '../src/bridge/camera';

const HOST = '127.0.0.1';
const TOTAL_SEC = 5400;
const TOTAL_LAYERS = 240;
const TOTAL_FILAMENT_MM = 12_400;
const CONNECT = 1;
const PUBLISH = 3;
const SUBSCRIBE = 8;
const PINGREQ = 12;
const PAUSE_REASON = { code: 11842, msg: 'filament jam' };

const IDENTITY = {
    ip: HOST,
    username: 'fake-user',
    password: 'fake-password',
    deviceId: 'fake-printer',
    modeId: '20028',
    modelName: 'Anycubic Kobra 4',
};

interface BoxChange {
    id?: number;
    auto_feed?: number;
    slots?: { index: number; type: string; color: number[] }[];
    feed_status?: { slot_index: number; type: number };
    drying_status?: { status: number; target_temp?: number; duration?: number; remain_time?: number };
}

interface RequestData {
    filename?: string;
    path?: string;
    files?: { filename: string }[];
    printerName?: string;
    fan_speed_pct?: number;
    status?: number;
    brightness?: number;
    type?: number;
    target_nozzle_temp?: number;
    target_hotbed_temp?: number;
    settings?: { print_speed_mode?: number; target_nozzle_temp?: number; target_hotbed_temp?: number };
    objects_skip_parts?: string[];
    multi_color_box?: BoxChange[];
}

interface Request {
    type: string;
    action: string;
    msgid?: string;
    data?: RequestData | null;
}

interface Reply {
    data?: unknown;
    state?: string;
    code?: number;
    msg?: string;
}

export interface FakePrinterOptions {
    httpPort?: number;
    mqttPort?: number;
    now?: () => number;
}

function packet(head: number, body: Buffer): Buffer {
    const length: number[] = [];
    let n = body.length;
    do {
        length.push((n % 128) | (n > 127 ? 128 : 0));
        n = Math.floor(n / 128);
    } while (n > 0);
    return Buffer.concat([Buffer.from([head, ...length]), body]);
}

function publishPacket(topic: string, payload: string): Buffer {
    const name = Buffer.from(topic);
    const size = Buffer.alloc(2);
    size.writeUInt16BE(name.length);
    return packet(PUBLISH << 4, Buffer.concat([size, name, Buffer.from(payload)]));
}

function readPacket(buf: Buffer): { type: number; body: Buffer; rest: Buffer } | null {
    let length = 0;
    for (let i = 1; i < buf.length && i <= 4; i++) {
        length += (buf[i] & 127) * 128 ** (i - 1);
        if (buf[i] & 128) continue;
        const start = i + 1;
        if (buf.length < start + length) return null;
        return {
            type: buf[0] >> 4,
            body: buf.subarray(start, start + length),
            rest: buf.subarray(start + length),
        };
    }
    return null;
}

export class FakePrinter {
    private readonly root = path.resolve(__dirname, '..');
    private readonly sockets = new Set<Socket>();
    private readonly token = randomBytes(16).toString('hex');
    private readonly thumbnail = fs.readFileSync(path.resolve(this.root, '../web/public/logo-1024.png'), 'base64');
    private readonly now: () => number;
    private readonly http: http.Server;
    private readonly mqtt: tls.Server;
    private lastStep: number;

    private name = 'Fake Kobra 4';
    private state = 'printing';
    private filename = 'Benchy_PLA_0.20mm_1h30m.gcode';
    private taskId = 'fake-1';
    private elapsedSec = TOTAL_SEC * 0.42;
    private temp = {
        curr_nozzle_temp: 219,
        target_nozzle_temp: 220,
        curr_hotbed_temp: 60,
        target_hotbed_temp: 60,
    };
    private fan = 80;
    private speedMode = 2;
    private light = { type: 3, status: 1, brightness: 80 };
    private skipped: string[] = [];
    private files = [
        { filename: this.filename, size: 4_812_330, timestamp: 1_790_000_000 },
        { filename: 'Bracket_PETG_0.20mm_45m.gcode', size: 1_903_112, timestamp: 1_789_000_000 },
    ];
    private boxes = [
        {
            id: -1,
            loaded_slot: -1,
            auto_feed: 0,
            slots: [
                { index: 0, status: 5, type: 'PLA', color: [20, 20, 20], weight: 50, edit_status: 1 },
                { index: 1, status: 5, type: 'TPU', color: [250, 130, 20], weight: 80, edit_status: 1 },
                { index: 2, status: 4, type: '', color: [0, 0, 0] },
                { index: 3, status: 5, type: '', color: [0, 0, 0] },
            ],
            drying_status: { status: 0, target_temp: 0, duration: 0, remain_time: 0, humidity: 0, current_temp: 0 },
        },
        {
            id: 0,
            loaded_slot: 0,
            auto_feed: 1,
            slots: [
                { index: 0, status: 5, type: 'PLA', color: [240, 90, 60], weight: 72, edit_status: 0 },
                { index: 1, status: 5, type: 'PETG', color: [40, 120, 220], weight: 35, edit_status: 1 },
                { index: 2, status: 5, type: 'PLA', color: [245, 245, 245], weight: 8, edit_status: 0 },
                { index: 3, status: 4, type: '', color: [0, 0, 0] },
            ],
            drying_status: { status: 0, target_temp: 0, duration: 0, remain_time: 0, humidity: 28, current_temp: 24 },
        },
        {
            id: 1,
            loaded_slot: -1,
            auto_feed: 1,
            slots: [
                { index: 0, status: 5, type: 'PLA', color: [200, 30, 35], weight: 90, edit_status: 0 },
                { index: 1, status: 5, type: 'PLA', color: [40, 170, 70], weight: 55, edit_status: 0 },
                { index: 2, status: 5, type: 'PLA', color: [230, 200, 40], weight: 20, edit_status: 0 },
                { index: 3, status: 5, type: 'PLA', color: [170, 170, 175], weight: 64, edit_status: 0 },
            ],
            drying_status: { status: 0, target_temp: 0, duration: 0, remain_time: 0, humidity: 35, current_temp: 23 },
        },
    ];

    constructor(private readonly opts: FakePrinterOptions = {}) {
        this.now = opts.now ?? Date.now;
        this.lastStep = this.now();
        this.http = http.createServer((req, res) => this.onHttp(req, res));
        this.mqtt = tls.createServer(
            {
                cert: fs.readFileSync(path.join(this.root, 'certs/anycubic_slicer.crt')),
                key: fs.readFileSync(path.join(this.root, 'certs/anycubic_slicer.key')),
            },
            (socket) => this.onSocket(socket),
        );
    }

    async start(): Promise<{ httpPort: number; mqttPort: number }> {
        const listen = (server: http.Server | tls.Server, port: number) =>
            new Promise<number>((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, HOST, () => resolve((server.address() as AddressInfo).port));
            });
        return {
            httpPort: await listen(this.http, this.opts.httpPort ?? 18910),
            mqttPort: await listen(this.mqtt, this.opts.mqttPort ?? 9883),
        };
    }

    stop(): void {
        for (const socket of this.sockets) socket.destroy();
        this.mqtt.close();
        this.http.close();
        this.http.closeAllConnections();
    }

    private get baseUrl(): string {
        return `http://${HOST}:${(this.http.address() as AddressInfo).port}`;
    }

    private onHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = new URL(req.url ?? '/', `http://${HOST}`);
        const json = (body: unknown) => res.setHeader('Content-Type', 'application/json').end(JSON.stringify(body));
        if (url.pathname === '/info') {
            json({ token: this.token });
        } else if (url.pathname === '/ctrl') {
            const iv = randomBytes(8).toString('hex');
            const cipher = createCipheriv('aes-128-cbc', this.token.slice(16, 32), iv);
            const info = Buffer.concat([cipher.update(JSON.stringify(IDENTITY)), cipher.final()]).toString('base64');
            json({ code: 200, data: { token: iv, info } });
        } else if (url.pathname === '/gcode_upload') {
            req.resume().on('end', () => json({ code: 200 }));
        } else if (url.pathname === '/flv') {
            this.streamCamera(res);
        } else {
            res.writeHead(404).end();
        }
    }

    private streamCamera(res: http.ServerResponse): void {
        const source = ['-re', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=15'];
        const codec = ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p'];
        const proc = spawn(resolveFfmpeg(), ['-loglevel', 'error', ...source, ...codec, '-g', '15', '-f', 'flv', '-'], {
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        proc.on('error', () => res.destroy());
        res.on('close', () => proc.kill('SIGKILL'));
        res.setHeader('Content-Type', 'video/x-flv');
        proc.stdout.pipe(res);
    }

    private onSocket(socket: Socket): void {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        socket.on('error', () => socket.destroy());
        let pending = Buffer.alloc(0);
        socket.on('data', (chunk) => {
            pending = Buffer.concat([pending, chunk]);
            for (let p = readPacket(pending); p; p = readPacket(pending)) {
                pending = Buffer.from(p.rest);
                this.onPacket(socket, p.type, p.body);
            }
        });
    }

    private onPacket(socket: Socket, type: number, body: Buffer): void {
        if (type === CONNECT) socket.write(packet(0x20, Buffer.from([0, 0])));
        else if (type === SUBSCRIBE) socket.write(packet(0x90, Buffer.from([body[0], body[1], 0])));
        else if (type === PINGREQ) socket.write(packet(0xd0, Buffer.alloc(0)));
        else if (type === PUBLISH) this.onRequest(body);
    }

    private onRequest(body: Buffer): void {
        const request: Request = JSON.parse(body.subarray(2 + body.readUInt16BE(0)).toString('utf8'));
        const finished = this.step();
        const reply = this.handle(request);
        if (reply) this.report(request.type, request.action, reply, request.msgid);
        if (finished) {
            this.report('print', 'start', { state: 'finished', data: this.project() });
            this.goIdle();
        } else if (request.type === 'info' && this.printing) {
            this.report('print', 'query', this.printReply());
            this.report('file', 'fileDetails', this.details(this.filename));
        }
    }

    private report(type: string, action: string, reply: Reply, msgid: string = randomUUID()): void {
        const topic = `anycubic/anycubicCloud/v1/printer/public/${IDENTITY.modeId}/${IDENTITY.deviceId}/${type}/report`;
        const message = { type, action, msgid, timestamp: this.now(), code: 200, state: 'done', msg: '', ...reply };
        const out = publishPacket(topic, JSON.stringify(message));
        for (const socket of this.sockets) socket.write(out);
    }

    private get printing(): boolean {
        return this.state === 'printing' || this.state === 'paused';
    }

    private step(): boolean {
        const dt = (this.now() - this.lastStep) / 1000;
        this.lastStep = this.now();
        const t = this.temp;
        const approach = (current: number, target: number, rate: number) => {
            const goal = target || 24;
            const gap = goal - current;
            return current + Math.sign(gap) * Math.min(Math.abs(gap), rate * dt);
        };
        t.curr_nozzle_temp = approach(t.curr_nozzle_temp, t.target_nozzle_temp, 4);
        t.curr_hotbed_temp = approach(t.curr_hotbed_temp, t.target_hotbed_temp, 1);
        if (this.state !== 'printing') return false;
        this.elapsedSec = Math.min(TOTAL_SEC, this.elapsedSec + dt);
        return this.elapsedSec >= TOTAL_SEC;
    }

    private goIdle(): void {
        this.state = 'free';
        this.elapsedSec = 0;
        this.skipped = [];
        this.temp.target_nozzle_temp = 0;
        this.temp.target_hotbed_temp = 0;
        this.fan = 0;
    }

    private project() {
        const done = this.elapsedSec / TOTAL_SEC;
        return {
            state: this.state,
            filename: this.filename,
            taskid: this.taskId,
            progress: Math.floor(done * 100),
            print_time: Math.floor(this.elapsedSec / 60),
            remain_time: Math.ceil((TOTAL_SEC - this.elapsedSec) / 60),
            curr_layer: Math.max(1, Math.floor(done * TOTAL_LAYERS)),
            total_layers: TOTAL_LAYERS,
        };
    }

    private printReply(): Reply {
        const usage = Math.round((this.elapsedSec / TOTAL_SEC) * TOTAL_FILAMENT_MM);
        return {
            state: this.state,
            ...(this.state === 'paused' ? PAUSE_REASON : {}),
            data: { ...this.project(), supplies_usage: usage, settings: { print_speed_mode: this.speedMode } },
        };
    }

    private updatedReply(): Reply {
        const { state: _, ...project } = this.project();
        return {
            state: 'updated',
            data: {
                ...project,
                settings: {
                    fan_speed_pct: this.fan,
                    print_speed_mode: this.speedMode,
                    target_hotbed_temp: this.temp.target_hotbed_temp,
                    target_nozzle_temp: this.temp.target_nozzle_temp,
                    z_comp: 0,
                },
            },
            msg: 'done',
        };
    }

    private details(filename: string): Reply {
        return { data: { filename, file_details: { filename, thumbnail: this.thumbnail } } };
    }

    private handle({ type, action, data }: Request): Reply | null {
        const d = data ?? {};
        switch (`${type}/${action}`) {
            case 'info/query':
                return { data: this.info() };
            case 'info/setPrinterName':
                this.name = d.printerName || this.name;
                return { data: this.info() };
            case 'print/query':
                return this.printing ? this.printReply() : null;
            case 'print/pause':
                if (this.state === 'printing') this.state = 'paused';
                return this.printReply();
            case 'print/resume':
                if (this.state === 'paused') this.state = 'printing';
                return this.printReply();
            case 'print/stop':
                if (!this.printing) return { state: 'failed', code: 10112, data: null };
                this.goIdle();
                return { state: 'stoped', data: { filename: this.filename, taskid: this.taskId } };
            case 'print/start':
                return this.startPrint(d.filename ?? '');
            case 'print/update':
                this.speedMode = d.settings?.print_speed_mode ?? this.speedMode;
                this.setTargets(d.settings?.target_nozzle_temp, d.settings?.target_hotbed_temp);
                return this.updatedReply();
            case 'tempature/set':
                this.setTargets(
                    d.type === 1 ? undefined : d.target_nozzle_temp,
                    d.type === 0 ? undefined : d.target_hotbed_temp,
                );
                return { data: this.roundedTemp() };
            case 'fan/setSpeed':
                this.fan = d.fan_speed_pct ?? this.fan;
                return { data: { fan_speed_pct: this.fan } };
            case 'light/query':
                return { data: { lights: [this.light] } };
            case 'light/control':
                this.light = { ...this.light, status: d.status ?? 0, brightness: d.brightness ?? 0 };
                return { data: { lights: [this.light] } };
            case 'peripherie/query':
                return { data: { camera: 1, udisk: 0, multiColorBox: 1 } };
            case 'multiColorBox/getInfo':
                return { data: { multi_color_box: this.boxes } };
            case 'multiColorBox/setInfo':
            case 'multiColorBox/setAutoFeed':
            case 'multiColorBox/setDry':
            case 'multiColorBox/feedFilament':
                for (const change of d.multi_color_box ?? []) this.changeBox(change);
                return { data: { multi_color_box: this.boxes } };
            case 'file/listLocal':
                return { data: { records: d.path === '/' ? this.files : [] } };
            case 'file/deleteBatch': {
                const names = (d.files ?? []).map((f) => f.filename);
                this.files = this.files.filter((f) => !names.includes(f.filename));
                return { state: 'success' };
            }
            case 'file/fileDetails':
                return this.details(d.filename ?? '');
            case 'skip/query_obj':
                return { data: { objects_skip_parts: this.skipped } };
            case 'skip/start':
                this.skipped = d.objects_skip_parts ?? [];
                return { data: { objects_skip_parts: this.skipped } };
            default:
                return { data: null };
        }
    }

    private startPrint(filename: string): Reply {
        if (this.printing) return { state: 'failed', code: 10112, data: null };
        this.state = 'printing';
        this.filename = filename;
        this.taskId = `fake-${this.now()}`;
        this.elapsedSec = 0;
        this.setTargets(220, 60);
        this.fan = 80;
        return { ...this.printReply(), code: 0 };
    }

    private setTargets(nozzle?: number, bed?: number): void {
        if (nozzle !== undefined) this.temp.target_nozzle_temp = nozzle;
        if (bed !== undefined) this.temp.target_hotbed_temp = bed;
    }

    private changeBox(change: BoxChange): void {
        const box = this.boxes.find((b) => b.id === (change.id ?? 0));
        if (!box) return;
        if (change.auto_feed !== undefined) box.auto_feed = change.auto_feed;
        for (const slot of change.slots ?? []) Object.assign(box.slots[slot.index] ?? {}, slot);
        if (change.feed_status) {
            for (const b of this.boxes) b.loaded_slot = -1;
            if (change.feed_status.type === 1) box.loaded_slot = change.feed_status.slot_index;
        }
        if (!change.drying_status) return;
        const off = { target_temp: 0, duration: 0, remain_time: 0 };
        box.drying_status = { ...box.drying_status, ...off, ...change.drying_status };
    }

    private roundedTemp() {
        return {
            ...this.temp,
            curr_nozzle_temp: Math.round(this.temp.curr_nozzle_temp),
            curr_hotbed_temp: Math.round(this.temp.curr_hotbed_temp),
        };
    }

    private info() {
        return {
            printerName: this.name,
            model: IDENTITY.modelName,
            version: '0.0.0-fake',
            state: this.printing ? 'busy' : this.state,
            temp: this.roundedTemp(),
            urls: { fileUploadurl: `${this.baseUrl}/gcode_upload?s=fake`, rtspUrl: `${this.baseUrl}/flv` },
            fan_speed_pct: this.fan,
            print_speed_mode: this.speedMode,
            features: {
                auto_leveling_support: 1,
                vibration_compensation_support: 1,
                flow_calibration_support: 1,
            },
            ...(this.printing ? { project: this.project() } : {}),
        };
    }
}

if (require.main === module) {
    new FakePrinter()
        .start()
        .then(() => console.log(`Fake printer ready: add a printer with the IP ${HOST} in the dashboard`))
        .catch((e: Error) => {
            console.error(e.message);
            process.exit(1);
        });
}
