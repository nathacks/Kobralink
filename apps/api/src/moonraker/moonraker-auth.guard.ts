import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrinterBridge } from '../bridge/printer-bridge';
import { PRINTER_BRIDGE } from './moonraker.service';
import { MoonrakerAuthService } from './moonraker-auth.service';

@Injectable()
export class MoonrakerAuthGuard implements CanActivate {
    constructor(
        private readonly authz: MoonrakerAuthService,
        @Inject(PRINTER_BRIDGE) private readonly bridge: PrinterBridge,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<Request>();
        if (!this.authz.required || req.method === 'OPTIONS' || this.authz.isOpenPath(req.path)) return true;
        if (await this.authz.authorize(req, this.bridge.id)) return true;
        throw new UnauthorizedException({ error: { code: 401, message: 'Unauthorized', traceback: null } });
    }
}
