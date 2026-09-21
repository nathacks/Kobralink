import type { IncomingMessage } from 'node:http';
import { Logger } from '@nestjs/common';
import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { localIpFor } from '../common/net';
import { MoonrakerService } from './moonraker.service';
import { MoonrakerAuthService } from './moonraker-auth.service';

interface RpcRequest {
    jsonrpc?: string;
    id?: number | string | null;
    method?: string;
    params?: Record<string, unknown> | unknown[];
}

@WebSocketGateway({ path: '/websocket' })
export class MoonrakerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly log = new Logger(MoonrakerGateway.name);
    private readonly clients = new Set<WebSocket>();
    private pushTimer: NodeJS.Timeout | null = null;
    private pending = false;

    constructor(
        private readonly moon: MoonrakerService,
        private readonly authz: MoonrakerAuthService,
    ) {}

    get clientCount(): number {
        return this.clients.size;
    }

    afterInit(): void {
        this.moon.bridge.on('state', () => this.schedulePush());
    }

    async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
        if (!(await this.authz.authorize(req, this.moon.bridge.id))) {
            this.log.warn('WS client rejected: missing or invalid API key');
            client.close(4401, 'Unauthorized');
            return;
        }
        this.clients.add(client);
        this.log.log(`WS client connected (${this.clients.size})`);
        this.sendRaw(client, { jsonrpc: '2.0', method: 'notify_klippy_ready', params: [] });
        this.sendRaw(client, {
            jsonrpc: '2.0',
            method: 'notify_status_update',
            params: [this.moon.printerObjects(), Date.now() / 1000],
        });
    }

    handleDisconnect(client: WebSocket): void {
        this.clients.delete(client);
        this.log.log(`WS client disconnected (${this.clients.size})`);
    }

    private schedulePush(): void {
        if (!this.clients.size) return;
        this.pending = true;
        if (this.pushTimer) return;
        this.pushTimer = setTimeout(() => {
            this.pushTimer = null;
            if (!this.pending) return;
            this.pending = false;
            const msg = JSON.stringify({
                jsonrpc: '2.0',
                method: 'notify_status_update',
                params: [this.moon.liveObjects(), Date.now() / 1000],
            });
            for (const c of this.clients) {
                if (c.readyState === c.OPEN) c.send(msg);
                else this.clients.delete(c);
            }
        }, 500);
    }

    private sendRaw(client: WebSocket, payload: unknown): void {
        if (client.readyState === client.OPEN) client.send(JSON.stringify(payload));
    }

    @SubscribeMessage('rpc')
    async onRpc(client: WebSocket, req: RpcRequest): Promise<void> {
        if (!this.clients.has(client)) return;
        const method = req.method ?? '';
        const rawParams = req.params;
        const params: Record<string, unknown> = Array.isArray(rawParams)
            ? ((rawParams[0] as Record<string, unknown>) ?? {})
            : (rawParams ?? {});
        this.log.debug(`RPC ${method}`);
        let result: unknown = {};
        let error: { code: number; message: string } | null = null;
        try {
            result = await this.dispatch(method, params);
        } catch (e) {
            error = { code: -32603, message: (e as Error).message };
        }
        if (req.id === undefined || req.id === null) return;
        this.sendRaw(client, error ? { jsonrpc: '2.0', id: req.id, error } : { jsonrpc: '2.0', id: req.id, result });
    }

    private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
        const bridge = this.moon.bridge;
        switch (method) {
            case 'printer.info':
            case 'printer_info':
                return this.moon.printerInfo();
            case 'server.info':
            case 'server_info':
                return this.moon.serverInfo(this.clients.size);
            case 'printer.objects.list':
                return { objects: Object.keys(this.moon.printerObjects()) };
            case 'printer.objects.query':
            case 'printer.objects.get':
            case 'printer.objects.subscribe':
                return {
                    status: this.moon.filterObjects(params.objects as string[] | Record<string, unknown> | undefined),
                    eventtime: Date.now() / 1000,
                };
            case 'printer.print.start': {
                const filename = String(params.filename ?? bridge.lastUploadedFilename);
                const file = await this.moon.gcode.getByFilename(filename);
                if (!file) return 'unknown file';
                if (bridge.isHeldForDialog(file.id)) return 'ok';
                const base = `http://${localIpFor(bridge.config.ip)}:${bridge.config.httpPort}`;
                await bridge.printStoredFile(file.id, { serveBase: base });
                return 'ok';
            }
            case 'printer.print.pause':
                await bridge.pause();
                return 'ok';
            case 'printer.print.resume':
                await bridge.resume();
                return 'ok';
            case 'printer.print.cancel':
                await bridge.cancel();
                return 'ok';
            case 'machine.system_info':
                return { system_info: { cpu_info: { cpu_desc: 'Kobra X Bridge' } } };
            case 'server.files.list':
                return [];
            case 'printer.gcode.script':
                return this.moon.execGcodeScript(String(params.script ?? ''));
            case 'server.connection.identify':
                return { connection_id: 1 };
            case 'connection.register_remote_method':
                return 'ok';
            case 'server.webcams.list': {
                const base = `http://${localIpFor(bridge.config.ip)}:${bridge.config.httpPort}`;
                return this.moon.webcams(base);
            }
            case 'server.job_queue.status':
                return this.moon.jobQueueStatus();
            case 'server.job_queue.post_job': {
                const names = (params.filenames as string[] | undefined) ?? [];
                for (const n of names) await this.moon.queue.addByFilename(bridge.id, String(n));
                return this.moon.jobQueueStatus();
            }
            case 'server.job_queue.delete_job': {
                if (params.all) await this.moon.queue.clear(bridge.id);
                else
                    for (const id of (params.job_ids as string[] | undefined) ?? [])
                        await this.moon.queue.remove(bridge.id, String(id));
                return this.moon.jobQueueStatus();
            }
            case 'server.job_queue.start':
                await this.moon.queue.startNext(bridge.id).catch(() => undefined);
                return this.moon.jobQueueStatus();
            case 'server.job_queue.pause':
                return this.moon.jobQueueStatus();
            case 'server.history.list':
                return this.moon.historyList(Number(params.limit) || 50);
            case 'machine.update.status':
                return { busy: false, version_info: {} };
            case 'server.files.metadata': {
                const name = String(params.filename ?? '') || bridge.snapshot().filename;
                return name ? this.moon.fileMetadata(name) : {};
            }
            case 'server.database.get_item': {
                const { body } = this.moon.databaseGet(String(params.namespace ?? ''), String(params.key ?? ''));
                return (body as { result?: unknown }).result ?? null;
            }
            case 'server.database.post_item':
                return this.moon.databaseSet(String(params.namespace ?? ''), String(params.key ?? ''), params.value)
                    .result;
            case 'server.database.list':
                return this.moon.databaseList();
            default:
                this.log.debug(`Unknown RPC method: ${method}`);
                return {};
        }
    }
}
