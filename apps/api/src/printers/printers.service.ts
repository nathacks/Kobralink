import { fetchPrinterCredentials } from '@kobralink/kobra-protocol';
import {
    type AddPrinterInput,
    type Printer as PrinterDto,
    type PrinterSettings,
    printerSettingsSchema,
    type UpdatePrinterInput,
} from '@kobralink/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BridgePrinterConfig } from '../bridge/printer-bridge';
import type { Printer } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const FIRST_MOONRAKER_PORT = 7125;

@Injectable()
export class PrintersService {
    constructor(private readonly prisma: PrismaService) {}

    static parseSettings(raw: string): PrinterSettings {
        try {
            return printerSettingsSchema.parse(JSON.parse(raw || '{}'));
        } catch {
            return printerSettingsSchema.parse({});
        }
    }

    static toDto(p: Printer): PrinterDto {
        return {
            id: p.id,
            name: p.name,
            ip: p.ip,
            mqttPort: p.mqttPort,
            username: p.username,
            deviceId: p.deviceId,
            modeId: p.modeId,
            model: p.model,
            httpPort: p.httpPort,
            settings: PrintersService.parseSettings(p.settings),
            createdAt: p.createdAt.toISOString(),
        };
    }

    static toBridgeConfig(p: Printer): BridgePrinterConfig {
        return {
            id: p.id,
            name: p.name,
            ip: p.ip,
            mqttPort: p.mqttPort,
            username: p.username,
            password: p.password,
            deviceId: p.deviceId,
            modeId: p.modeId,
            httpPort: p.httpPort,
            settings: PrintersService.parseSettings(p.settings),
        };
    }

    async findAll(): Promise<Printer[]> {
        return this.prisma.client.printer.findMany({ orderBy: { createdAt: 'asc' } });
    }

    async findOne(id: string): Promise<Printer> {
        const p = await this.prisma.client.printer.findUnique({ where: { id } });
        if (!p) throw new NotFoundException('Imprimante introuvable');
        return p;
    }

    private async nextFreePort(): Promise<number> {
        const used = new Set(
            (await this.prisma.client.printer.findMany({ select: { httpPort: true } })).map((p) => p.httpPort),
        );
        let port = FIRST_MOONRAKER_PORT;
        while (used.has(port)) port++;
        return port;
    }

    async add(input: AddPrinterInput): Promise<Printer> {
        const creds = await fetchPrinterCredentials(input.ip);
        if (!creds.username || !creds.password || !creds.deviceId) {
            throw new ConflictException("L'imprimante a répondu mais sans identifiants exploitables");
        }
        const existing = await this.prisma.client.printer.findFirst({
            where: { deviceId: creds.deviceId },
        });
        if (existing) throw new ConflictException(`Cette imprimante existe déjà (${existing.name})`);
        const httpPort = input.httpPort ?? (await this.nextFreePort());
        const clash = await this.prisma.client.printer.findUnique({ where: { httpPort } });
        if (clash) throw new ConflictException(`Le port ${httpPort} est déjà utilisé par ${clash.name}`);
        return this.prisma.client.printer.create({
            data: {
                name: input.name?.trim() || creds.model || 'Anycubic Kobra X',
                ip: creds.printerIp || input.ip,
                username: creds.username,
                password: creds.password,
                deviceId: creds.deviceId,
                modeId: creds.modeId,
                model: creds.model,
                httpPort,
                settings: JSON.stringify(printerSettingsSchema.parse({})),
            },
        });
    }

    async update(id: string, input: UpdatePrinterInput): Promise<Printer> {
        const current = await this.findOne(id);
        if (input.httpPort && input.httpPort !== current.httpPort) {
            const clash = await this.prisma.client.printer.findUnique({
                where: { httpPort: input.httpPort },
            });
            if (clash) throw new ConflictException(`Le port ${input.httpPort} est déjà utilisé par ${clash.name}`);
        }
        const settings = input.settings
            ? printerSettingsSchema.parse({
                  ...PrintersService.parseSettings(current.settings),
                  ...input.settings,
              })
            : undefined;
        return this.prisma.client.printer.update({
            where: { id },
            data: {
                name: input.name,
                ip: input.ip,
                httpPort: input.httpPort,
                settings: settings ? JSON.stringify(settings) : undefined,
            },
        });
    }

    async refreshCredentials(id: string): Promise<Printer> {
        const current = await this.findOne(id);
        const creds = await fetchPrinterCredentials(current.ip);
        return this.prisma.client.printer.update({
            where: { id },
            data: {
                username: creds.username,
                password: creds.password,
                deviceId: creds.deviceId,
                modeId: creds.modeId,
                model: creds.model,
            },
        });
    }

    async remove(id: string): Promise<void> {
        await this.findOne(id);
        await this.prisma.client.printer.delete({ where: { id } });
    }
}
