import { measuredKwh } from '@kobralink/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { PrismaService } from '../prisma/prisma.service';
import { HaApiService } from './ha-api.service';

@Injectable()
export class EnergyService {
    private readonly log = new Logger(EnergyService.name);
    private readonly detached = new Map<string, () => void>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly ha: HaApiService,
    ) {}

    attach(bridge: PrinterBridge): void {
        const onJob = (phase: 'start' | 'end', jobId: string) => {
            const task = phase === 'start' ? this.onStart(bridge, jobId) : this.onEnd(bridge, jobId);
            void task.catch((e) => this.log.warn(`Energy of ${bridge.config.name}: ${(e as Error).message}`));
        };
        bridge.on('job', onJob);
        this.detached.set(bridge.id, () => bridge.off('job', onJob));
    }

    detach(printerId: string): void {
        this.detached.get(printerId)?.();
        this.detached.delete(printerId);
    }

    private sensor(bridge: PrinterBridge): string {
        return this.ha.configured() ? bridge.settings.energySensor : '';
    }

    async onStart(bridge: PrinterBridge, jobId: string): Promise<void> {
        const sensor = this.sensor(bridge);
        if (!sensor || !jobId) return;
        const kwh = await this.ha.readKwh(sensor);
        if (kwh === null) return;
        await this.prisma.client.printJob.update({ where: { id: jobId }, data: { energyStartKwh: kwh } });
    }

    async onEnd(bridge: PrinterBridge, jobId: string): Promise<void> {
        const sensor = this.sensor(bridge);
        if (!sensor || !jobId) return;
        const job = await this.prisma.client.printJob.findUnique({ where: { id: jobId } });
        if (!job || job.energyStartKwh === null) return;
        const used = measuredKwh(job.energyStartKwh, await this.ha.readKwh(sensor));
        if (used === null) return;
        await this.prisma.client.printJob.update({ where: { id: jobId }, data: { energyKwh: used } });
        this.log.log(`Energy of ${job.filename} on ${bridge.config.name}: ${used} kWh`);
    }
}
