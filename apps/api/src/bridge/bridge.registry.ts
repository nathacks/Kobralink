import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { FilamentService } from '../filament/filament.service';
import { GcodeService } from '../gcode/gcode.service';
import { MoonrakerHost } from '../moonraker/moonraker.host';
import { PrintersService } from '../printers/printers.service';
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
        const rows = await this.printers.findAll();
        for (const row of rows) {
            try {
                await this.spawn(PrintersService.toBridgeConfig(row));
            } catch (e) {
                this.log.error(`Impossible de démarrer le bridge pour ${row.name}: ${(e as Error).message}`);
            }
        }
        if (!rows.length) this.log.log('Aucune imprimante configurée — ajoutez-en une depuis l’UI');
    }

    async onModuleDestroy(): Promise<void> {
        for (const id of [...this.bridges.keys()]) await this.despawn(id);
    }

    list(): PrinterBridge[] {
        return [...this.bridges.values()];
    }

    get(id: string): PrinterBridge {
        const b = this.bridges.get(id);
        if (!b) throw new NotFoundException('Bridge introuvable pour cette imprimante');
        return b;
    }

    has(id: string): boolean {
        return this.bridges.has(id);
    }

    async spawn(config: ReturnType<typeof PrintersService.toBridgeConfig>): Promise<PrinterBridge> {
        if (this.bridges.has(config.id)) return this.bridges.get(config.id) as PrinterBridge;
        const bridge = new PrinterBridge(config, this.gcode, this.loadCerts());
        this.bridges.set(config.id, bridge);
        bridge.start();
        await this.moonraker.startFor(bridge);
        this.log.log(`Bridge démarré: ${config.name} (${config.ip}) → Moonraker :${config.httpPort}`);
        return bridge;
    }

    async despawn(id: string): Promise<void> {
        const bridge = this.bridges.get(id);
        if (!bridge) return;
        this.bridges.delete(id);
        await this.moonraker.stopFor(id);
        await bridge.stop();
        this.filaments.forgetPrinter(id);
        this.log.log(`Bridge arrêté: ${bridge.config.name}`);
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
