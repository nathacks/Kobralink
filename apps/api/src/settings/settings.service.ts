import { EventEmitter } from 'node:events';
import { type AppSettings, appSettingsSchema, type UpdateAppSettingsInput } from '@kobralink/shared';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService extends EventEmitter<{ change: [AppSettings] }> implements OnModuleInit {
    private readonly log = new Logger(SettingsService.name);
    private current: AppSettings = appSettingsSchema.parse({});

    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async onModuleInit(): Promise<void> {
        const rows = await this.prisma.client.appSetting.findMany();
        const raw: Record<string, unknown> = {};
        for (const r of rows) {
            try {
                raw[r.key] = JSON.parse(r.value);
            } catch {
                raw[r.key] = r.value;
            }
        }
        const parsed = appSettingsSchema.safeParse(raw);
        if (parsed.success) this.current = parsed.data;
        else this.log.warn(`Invalid settings in database, using defaults: ${parsed.error.message}`);
    }

    get(): AppSettings {
        return this.current;
    }

    async update(patch: UpdateAppSettingsInput): Promise<AppSettings> {
        const next = appSettingsSchema.parse({ ...this.current, ...patch });
        await this.prisma.client.$transaction(
            (Object.keys(patch) as (keyof AppSettings)[]).map((key) =>
                this.prisma.client.appSetting.upsert({
                    where: { key },
                    create: { key, value: JSON.stringify(next[key]) },
                    update: { value: JSON.stringify(next[key]) },
                }),
            ),
        );
        this.current = next;
        this.emit('change', next);
        return next;
    }
}
