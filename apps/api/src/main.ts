import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadEnv } from './config/env';
import { initPrisma } from './prisma/prisma.service';

async function bootstrap() {
    const env = loadEnv();
    const log = new Logger('Kobralink');
    await initPrisma();
    const { AppModule } = await import('./app.module.js');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false,
        logger: env.isDev ? ['error', 'warn', 'log', 'debug'] : ['error', 'warn', 'log'],
    });
    app.enableCors({ origin: [env.baseUrl, ...env.extraOrigins], credentials: true });
    app.enableShutdownHooks();
    await app.listen(env.port, '0.0.0.0');
    log.log(
        `UI + API: ${env.baseUrl}  (données: ${env.dataDir}, runtime: ${process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`})`,
    );
    if (!env.webDir) log.warn('Build web introuvable — UI servie par Vite en dev (bun dev)');
}

bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
});
