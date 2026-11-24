import { MCP_PATH, type McpInfoDto } from '@kobralink/shared';
import { All, Controller, Delete, Get, HttpCode, Param, Req, Res, SetMetadata } from '@nestjs/common';
import { AllowAnonymous, AuthService, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { toNodeHandler } from 'better-auth/node';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type { KobralinkAuth } from '../auth/auth';
import { ALLOW_VIEWER_WRITE } from '../common/write.guard';
import { loadEnv } from '../config/env';
import { m } from '../i18n/locale';
import { SettingsService } from '../settings/settings.service';
import { McpService } from './mcp.service';
import { McpAuthService } from './mcp-auth.service';

@Controller()
export class McpController {
    constructor(
        private readonly mcp: McpService,
        private readonly authz: McpAuthService,
        private readonly settings: SettingsService,
        private readonly auth: AuthService<KobralinkAuth>,
    ) {}

    @All('api/mcp')
    @AllowAnonymous()
    async serve(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
        if (!this.settings.get().mcpEnabled) {
            res.status(404).json({ message: m.api_mcp_disabled() });
            return;
        }
        await toNodeHandler((request: Request) =>
            this.authz.handle(request, (r, principal) => this.mcp.serve(r, principal)),
        )(req, res);
    }

    @All([
        '.well-known/oauth-protected-resource{/*rest}',
        '.well-known/oauth-authorization-server{/*rest}',
        '.well-known/openid-configuration{/*rest}',
    ])
    @AllowAnonymous()
    async discovery(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
        if (!this.settings.get().mcpEnabled || !loadEnv().oauthAvailable) {
            res.status(404).json({ message: m.api_mcp_disabled() });
            return;
        }
        await toNodeHandler(this.auth.instance)(req, res);
    }

    @Get('api/v1/mcp')
    info(): McpInfoDto {
        const { baseUrl, oauthAvailable } = loadEnv();
        return { enabled: this.settings.get().mcpEnabled, url: `${baseUrl}${MCP_PATH}`, oauth: oauthAvailable };
    }

    @Get('api/v1/mcp/tools')
    tools() {
        return this.mcp.catalog();
    }

    @Get('api/v1/mcp/connections')
    connections(@Session() session: UserSession) {
        return this.authz.connections(session.user.id);
    }

    @Delete('api/v1/mcp/connections/:id')
    @HttpCode(204)
    @SetMetadata(ALLOW_VIEWER_WRITE, true)
    async disconnect(@Param('id') id: string, @Session() session: UserSession) {
        await this.authz.disconnect(session.user.id, id);
    }
}
