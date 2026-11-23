import { describe, expect, it } from 'bun:test';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SettingsService } from '../src/settings/settings.service';
import { SystemService } from '../src/system/system.service';

describe('SystemService.info', () => {
    it('reports the server time zone used by time-based automations', async () => {
        const settings = { get: () => ({ updateCheck: false }) } as unknown as SettingsService;
        const info = await new SystemService({} as PrismaService, settings).info();
        expect(info.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
        expect(info.timeZone.length).toBeGreaterThan(0);
        expect(info.update).toBeNull();
    });
});
