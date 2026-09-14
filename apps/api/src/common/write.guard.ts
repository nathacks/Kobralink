import { canOperate, type UserRole } from '@kobralink/shared';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type { KobralinkAuth } from '../auth/auth';
import { m } from '../i18n/locale';

export const ALLOW_VIEWER_WRITE = 'kobralink:allowViewerWrite';

type AuthedRequest = Request & { user?: { role?: string } | null };

@Injectable()
export class WriteGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly auth: AuthService<KobralinkAuth>,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<AuthedRequest>();
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
        if (!req.path.startsWith('/kx/')) return true;
        if (this.reflector.getAllAndOverride<boolean>(ALLOW_VIEWER_WRITE, [ctx.getHandler(), ctx.getClass()])) {
            return true;
        }
        let role = req.user?.role as UserRole | undefined;
        if (req.user === undefined) {
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) {
                if (typeof v === 'string') headers.set(k, v);
                else if (Array.isArray(v)) headers.set(k, v.join(','));
            }
            const session = await this.auth.api.getSession({ headers });
            if (!session) return true;
            role = (session.user as { role?: string }).role as UserRole | undefined;
        }
        if (!canOperate(role)) throw new ForbiddenException(m.api_forbidden_role());
        return true;
    }
}
