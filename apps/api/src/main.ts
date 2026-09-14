import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadEnv } from './config/env';
import { installI18n, localeMiddleware } from './i18n/locale';
import { BufferedLogger } from './logs/log-buffer';
import { initPrisma } from './prisma/prisma.service';
import { SettingsService } from './settings/settings.service';
import { applyPendingRestore } from './system/restore';

async function bootstrap() {
    const env = loadEnv();
    const log = new Logger('Kobralink');
    installI18n();
    applyPendingRestore(env.dataDir, (msg) => log.log(msg));
    await initPrisma();
    const { AppModule } = await import('./app.module.js');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false,
        logger: new BufferedLogger('Kobralink', {
            logLevels: env.isDev ? ['error', 'warn', 'log', 'debug'] : ['error', 'warn', 'log'],
        }),
    });
    app.use(localeMiddleware);
    const settings = app.get(SettingsService);
    const http = new Logger('HTTP');
    app.use(
        (
            req: { method: string; originalUrl: string },
            res: { statusCode: number; once: (ev: string, fn: () => void) => void },
            next: () => void,
        ) => {
            if (!settings.get().verboseHttpLog) return next();
            const started = Date.now();
            res.once('finish', () =>
                http.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started} ms)`),
            );
            next();
        },
    );
    app.enableCors({ origin: [env.baseUrl, ...env.extraOrigins], credentials: true });
    app.enableShutdownHooks();
    await app.listen(env.port, '0.0.0.0');
    const runtime = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`;
    if (env.isDev) {
        log.log(`API: ${env.baseUrl}  (data: ${env.dataDir}, runtime: ${runtime})`);
        log.log('UI dev (HMR): http://localhost:5173  — do not use :7100 for the front in dev');
    } else {
        log.log(`UI + API: ${env.baseUrl}  (data: ${env.dataDir}, runtime: ${runtime})`);
        if (!env.webDir) log.warn('Web build not found — UI served by Vite in dev (bun dev)');
    }
}

bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
});
