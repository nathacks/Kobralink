import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { loadEnv } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';
import { applyMigrations } from './migrator';

let singleton: PrismaClient | null = null;

export async function initPrisma(): Promise<PrismaClient> {
    if (singleton) return singleton;
    const env = loadEnv();
    const log = new Logger('Prisma');
    await applyMigrations(env.databaseUrl, env.migrationsDir, (m) => log.log(m));
    const adapter = new PrismaLibSql({ url: env.databaseUrl });
    singleton = new PrismaClient({ adapter });
    return singleton;
}

export function getPrisma(): PrismaClient {
    if (!singleton) throw new Error('Prisma non initialisé — appelez initPrisma() au démarrage');
    return singleton;
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
    readonly client = getPrisma();

    async onModuleDestroy() {
        await this.client.$disconnect();
    }
}
