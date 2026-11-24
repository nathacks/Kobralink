import { Controller, Get, Header, Req, UnauthorizedException } from '@nestjs/common';
import { AllowAnonymous, AuthService } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type { KobralinkAuth } from '../auth/auth';
import { BridgeRegistry } from '../bridge/bridge.registry';
import { renderMetrics } from './metrics';

@Controller('api/v1')
export class MetricsController {
    constructor(
        private readonly auth: AuthService<KobralinkAuth>,
        private readonly registry: BridgeRegistry,
    ) {}

    @Get('metrics')
    @AllowAnonymous()
    @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
    @Header('cache-control', 'no-store')
    async metrics(@Req() req: Request): Promise<string> {
        const scope = await this.scope(req);
        const states = this.registry
            .list()
            .filter((b) => scope === null || b.id === scope)
            .map((b) => b.snapshot());
        return renderMetrics(states);
    }

    private async scope(req: Request): Promise<string | null> {
        const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        const key = bearer ?? (typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : '');
        if (key) {
            const res = await this.auth.api.verifyApiKey({ body: { key } }).catch(() => null);
            if (!res?.valid) throw new UnauthorizedException();
            const printerId = (res.key?.metadata as { printerId?: unknown } | null | undefined)?.printerId;
            return typeof printerId === 'string' && printerId ? printerId : null;
        }
        const headers = new Headers();
        if (req.headers.cookie) headers.set('cookie', req.headers.cookie);
        if (!(await this.auth.api.getSession({ headers }))) throw new UnauthorizedException();
        return null;
    }
}
