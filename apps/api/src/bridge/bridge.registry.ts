import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { DetectionService } from '../detection/detection.service';
import { FilamentService } from '../filament/filament.service';
import { GcodeService } from '../gcode/gcode.service';
import { HaMqttService } from '../ha/ha-mqtt.service';
import { m } from '../i18n/locale';
import { MoonrakerHost } from '../moonraker/moonraker.host';
import { NotificationService } from '../notifications/notification.service';
import { PrintersService } from '../printers/printers.service';
import { QueueService } from '../queue/queue.service';
import { SpoolmanService } from '../spoolman/spoolman.service';
import { LocalSpoolService } from '../spools/local-spool.service';
import { TimelapseService } from '../timelapse/timelapse.service';
import { PrinterBridge } from './printer-bridge';

@Injectable()
export class BridgeRegistry implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger(BridgeRegistry.name);
    private readonly bridges = new Map<string, PrinterBridge>();
    private certs: { cert: Buffer; key: Buffer } | null = null;

    constructor(
        private readonly printers: PrintersService,
        private readonly gcode: GcodeService,
        private readonly moonraker: MoonrakerHost,
        private readonly filaments: FilamentService,
        private readonly spoolman: SpoolmanService,
        private readonly localSpools: LocalSpoolService,
        private readonly notifications: NotificationService,
        private readonly timelapses: TimelapseService,
        private readonly detection: DetectionService,
        private readonly queue: QueueService,
        private readonly ha: HaMqttService,
    ) {}

    private loadCerts(): { cert: Buffer; key: Buffer } {
        if (this.certs) return this.certs;
        const dir = loadEnv().certsDir;
        const certPath = path.join(dir, 'anycubic_slicer.crt');
        const keyPath = path.join(dir, 'anycubic_slicer.key');
        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
            throw new Error(
                `Certificats TLS manquants: anycubic_slicer.crt + anycubic_slicer.key attendus dans ${dir}`,
            );
        }
        this.certs = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
        return this.certs;
    }

    async onModuleInit(): Promise<void> {
        const stale = await this.gcode.closeStaleJobs();
        if (stale) this.log.warn(`${stale} job(s) left open by a previous run marked as error`);
        const rows = await this.printers.findAll();
        for (const row of rows) {
            try {
                await this.spawn(PrintersService.toBridgeConfig(row));
            } catch (e) {
                this.log.error(`Unable to start the bridge for ${row.name}: ${(e as Error).message}`);
            }
        }
        if (!rows.length) this.log.log('No printer configured — add one from the UI');
    }

    async onModuleDestroy(): Promise<void> {
        for (const id of [...this.bridges.keys()]) await this.despawn(id);
    }

    list(): PrinterBridge[] {
        return [...this.bridges.values()];
    }

    get(id: string): PrinterBridge {
        const b = this.bridges.get(id);
        if (!b) throw new NotFoundException(m.api_bridge_not_found());
        return b;
    }

    has(id: string): boolean {
        return this.bridges.has(id);
    }

    async spawn(config: ReturnType<typeof PrintersService.toBridgeConfig>): Promise<PrinterBridge> {
        if (this.bridges.has(config.id)) return this.bridges.get(config.id) as PrinterBridge;
        const bridge = new PrinterBridge(config, this.gcode, this.loadCerts(), [this.spoolman, this.localSpools]);
        this.bridges.set(config.id, bridge);
        this.notifications.attach(bridge);
        this.timelapses.attach(bridge);
        this.detection.attach(bridge);
        this.queue.attach(bridge);
        this.ha.attach(bridge);
        bridge.start();
        await this.moonraker.startFor(bridge);
        this.log.log(`Bridge started: ${config.name} (${config.ip}) → Moonraker :${config.httpPort}`);
        return bridge;
    }

    async despawn(id: string): Promise<void> {
        const bridge = this.bridges.get(id);
        if (!bridge) return;
        this.bridges.delete(id);
        this.notifications.detach(id);
        this.timelapses.detach(id);
        this.detection.detach(id);
        this.queue.detach(id);
        this.ha.detach(id);
        await this.moonraker.stopFor(id);
        await bridge.stop();
        this.filaments.forgetPrinter(id);
        this.spoolman.forgetPrinter(id);
        this.localSpools.forgetPrinter(id);
        this.log.log(`Bridge stopped: ${bridge.config.name}`);
    }

    async refresh(id: string): Promise<void> {
        const row = await this.printers.findOne(id);
        const config = PrintersService.toBridgeConfig(row);
        const bridge = this.bridges.get(id);
        if (!bridge) {
            await this.spawn(config);
            return;
        }
        const portChanged = bridge.config.httpPort !== config.httpPort;
        await bridge.updateConfig(config);
        if (portChanged) {
            await this.moonraker.stopFor(id);
            await this.moonraker.startFor(bridge);
        }
    }
}
