import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { createAuth } from './auth/auth';
import { SetupController } from './auth/setup.controller';
import { BridgeModule } from './bridge/bridge.module';
import { WriteGuard } from './common/write.guard';
import { loadEnv } from './config/env';
import { DryScheduleModule } from './dry/dry-schedule.module';
import { FilamentModule } from './filament/filament.module';
import { GcodeModule } from './gcode/gcode.module';
import { HaMqttModule } from './ha/ha-mqtt.module';
import { KxModule } from './kx/kx.module';
import { MacroModule } from './macros/macro.module';
import { NotificationModule } from './notifications/notification.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { SettingsModule } from './settings/settings.module';
import { SpoolmanModule } from './spoolman/spoolman.module';
import { LocalSpoolModule } from './spools/local-spool.module';
import { StatsModule } from './stats/stats.module';
import { SystemModule } from './system/system.module';
import { TimelapseModule } from './timelapse/timelapse.module';
import { UsersModule } from './users/users.module';

const env = loadEnv();

@Module({
    imports: [
        PrismaModule,
        AuthModule.forRoot({ auth: createAuth(), bodyParser: { json: { limit: '5mb' } } }),
        GcodeModule,
        SettingsModule,
        SpoolmanModule,
        NotificationModule,
        LocalSpoolModule,
        TimelapseModule,
        QueueModule,
        MacroModule,
        HaMqttModule,
        FilamentModule,
        BridgeModule,
        KxModule,
        StatsModule,
        DryScheduleModule,
        UsersModule,
        SystemModule,
        ...(env.webDir
            ? [
                  ServeStaticModule.forRoot({
                      rootPath: env.webDir,
                      exclude: ['/api/{*path}', '/kx/{*path}'],
                  }),
              ]
            : []),
    ],
    controllers: [SetupController],
    providers: [{ provide: APP_GUARD, useClass: WriteGuard }],
})
export class AppModule {}
