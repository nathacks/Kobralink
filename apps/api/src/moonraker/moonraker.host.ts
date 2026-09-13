import { Injectable, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { GcodeService } from '../gcode/gcode.service';
import { MoonrakerAppModule } from './moonraker-app.module';

@Injectable()
export class MoonrakerHost {
    private readonly log = new Logger(MoonrakerHost.name);
    private readonly apps = new Map<string, NestExpressApplication>();

    constructor(private readonly gcode: GcodeService) {}

    async startFor(bridge: PrinterBridge): Promise<void> {
        if (this.apps.has(bridge.id)) return;
        const app = await NestFactory.create<NestExpressApplication>(
            MoonrakerAppModule.forPrinter(bridge, this.gcode),
            {
                logger: ['error', 'warn', 'log'],
                bodyParser: true,
                cors: { origin: true, credentials: false },
            },
        );
        app.useBodyParser('json', { limit: '5mb' });
        app.useBodyParser('urlencoded', { extended: true, limit: '5mb' });
        const adapter = new WsAdapter(app, {
            messageParser: (data) => ({ event: 'rpc', data: JSON.parse(data.toString()) }),
        });
        app.useWebSocketAdapter(adapter);
        try {
            await app.listen(bridge.config.httpPort, '0.0.0.0');
        } catch (e) {
            this.log.error(
                `Port Moonraker ${bridge.config.httpPort} indisponible pour ${bridge.config.name}: ${(e as Error).message}`,
            );
            await app.close().catch(() => undefined);
            return;
        }
        this.apps.set(bridge.id, app);
        this.log.log(`Moonraker ${bridge.config.name} → http://0.0.0.0:${bridge.config.httpPort}`);
    }

    async stopFor(id: string): Promise<void> {
        const app = this.apps.get(id);
        if (!app) return;
        this.apps.delete(id);
        await app.close().catch(() => undefined);
    }
}
