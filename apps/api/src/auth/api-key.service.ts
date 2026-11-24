import { type ApiKeyMetadata, type ApiKeyUse, apiKeyMetadata } from '@kobralink/shared';
import { Global, Injectable, Module } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { KobralinkAuth } from './auth';

export interface VerifiedApiKey extends ApiKeyMetadata {
    id: string;
    name: string;
    userId: string;
}

@Injectable()
export class ApiKeyService {
    constructor(private readonly auth: AuthService<KobralinkAuth>) {}

    async verify(key: string, accepted: readonly ApiKeyUse[]): Promise<VerifiedApiKey | null> {
        if (!key) return null;
        const res = await this.auth.api.verifyApiKey({ body: { key } }).catch(() => null);
        if (!res?.valid || !res.key) return null;
        const meta = apiKeyMetadata(res.key.metadata);
        if (!meta.uses.some((u) => accepted.includes(u))) return null;
        return { id: res.key.id, name: res.key.name ?? res.key.id, userId: res.key.referenceId, ...meta };
    }
}

@Global()
@Module({ providers: [ApiKeyService], exports: [ApiKeyService] })
export class ApiKeyModule {}
