import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { createAuth } from './auth/auth';
import { SetupController } from './auth/setup.controller';
import { BridgeModule } from './bridge/bridge.module';
import { loadEnv } from './config/env';
import { GcodeModule } from './gcode/gcode.module';
import { KxModule } from './kx/kx.module';
import { PrismaModule } from './prisma/prisma.module';

const env = loadEnv();

@Module({
    imports: [
        PrismaModule,
        AuthModule.forRoot({ auth: createAuth(), bodyParser: { json: { limit: '5mb' } } }),
        GcodeModule,
        BridgeModule,
        KxModule,
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
})
export class AppModule {}
