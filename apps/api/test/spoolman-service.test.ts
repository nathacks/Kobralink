import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { type AppSettings, appSettingsSchema } from '@kobralink/shared';
import type { NotificationService } from '../src/notifications/notification.service';
import { PrintersService } from '../src/printers/printers.service';
import type { SettingsService } from '../src/settings/settings.service';
import { SpoolmanService } from '../src/spoolman/spoolman.service';
import { LocalSpoolService } from '../src/spools/local-spool.service';
import { seedPrinter, type TestDb, testDb } from './helpers/db';

let db: TestDb;
let current: AppSettings;
const settings = { get: () => current, on: () => undefined } as unknown as SettingsService;
const emitCustom = mock(() => undefined);
const notifications = { emitCustom } as unknown as NotificationService;
const realFetch = globalThis.fetch;

type Reply = { ok: boolean; body?: unknown };
let replies: Reply[] = [];
const requests: { method: string; url: string; body: unknown }[] = [];

function serve(...next: Reply[]) {
    replies = next;
}

const spool = (id: number, remaining: number) => ({
    id,
    remaining_weight: remaining,
    price: 25,
    initial_weight: 1000,
    filament: { id: 1, name: 'PETG Black', density: 1.27, diameter: 1.75 },
});

function service() {
    return new SpoolmanService(db.prisma, settings, new PrintersService(db.prisma, {} as never), notifications);
}

beforeAll(async () => {
    db = await testDb();
    await seedPrinter(db.client, 'p1', 'Kobra');
    await db.client.printer.update({
        where: { id: 'p1' },
        data: { settings: JSON.stringify({ alerts: { spoolLowG: 100 } }) },
    });
});

afterAll(() => db.close());

beforeEach(async () => {
    current = appSettingsSchema.parse({ spoolmanUrl: 'http://spoolman.test:7912' });
    await db.client.spoolmanPendingUse.deleteMany();
    emitCustom.mockClear();
    requests.length = 0;
    replies = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        requests.push({
            method: init?.method ?? 'GET',
            url: String(url),
            body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        const reply = replies.shift() ?? { ok: false };
        if (!reply.ok) return new Response('down', { status: 503 });
        return new Response(JSON.stringify(reply.body ?? {}), { status: 200 });
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('SpoolmanService usage reports', () => {
    it('reports the length used to the spool', async () => {
        serve({ ok: true, body: spool(7, 800) });
        await service().useFilament(7, 123.456, 'p1');
        expect(requests).toEqual([
            { method: 'PUT', url: 'http://spoolman.test:7912/api/v1/spool/7/use', body: { use_length: 123.46 } },
        ]);
        expect(await db.client.spoolmanPendingUse.count()).toBe(0);
    });

    it('keeps a report that failed and sends it once Spoolman answers again', async () => {
        const svc = service();
        serve({ ok: false });
        await svc.useFilament(7, 50, 'p1');
        serve({ ok: false });
        await svc.useFilament(7, 25, 'p1');
        expect(await svc.pendingCount()).toBe(2);
        serve({ ok: true, body: spool(7, 900) }, { ok: false });
        expect(await svc.flushPending()).toBe(1);
        expect(await svc.pendingCount()).toBe(1);
        serve({ ok: true, body: spool(7, 875) });
        expect(await svc.flushPending()).toBe(1);
        expect(await svc.pendingCount()).toBe(0);
        expect(
            requests.filter((r) => r.method === 'PUT').map((r) => (r.body as { use_length: number }).use_length),
        ).toEqual([50, 25, 50, 25, 25]);
    });

    it('does nothing to flush without a server', async () => {
        current = appSettingsSchema.parse({});
        expect(await service().flushPending()).toBe(0);
        expect(requests).toEqual([]);
    });
});

describe('SpoolmanService low spool alert', () => {
    it('warns once when the spool falls under the printer threshold', async () => {
        const svc = service();
        serve({ ok: true, body: spool(9, 150) }, { ok: true, body: spool(9, 80) }, { ok: true, body: spool(9, 60) });
        await svc.useFilament(9, 10, 'p1');
        await svc.useFilament(9, 10, 'p1');
        await svc.useFilament(9, 10, 'p1');
        expect(emitCustom).toHaveBeenCalledTimes(1);
        expect(emitCustom).toHaveBeenCalledWith('p1', 'Kobra', 'alert_spool_low', { spool: 'PETG Black', grams: 80 });
    });

    it('stays silent without a printer or a remaining weight', async () => {
        const svc = service();
        serve({ ok: true, body: spool(9, 10) }, { ok: true, body: { id: 9, filament: {} } });
        await svc.useFilament(9, 10);
        await svc.useFilament(9, 10, 'p1');
        expect(emitCustom).not.toHaveBeenCalled();
    });
});

describe('SpoolmanService pricing', () => {
    it('describes a spool from a cached list', async () => {
        const svc = service();
        serve({ ok: true, body: [spool(3, 500)] });
        const pricing = await svc.describe(3);
        expect(pricing?.pricePerG).toBe(0.025);
        expect(pricing?.gramsPerMm).toBeCloseTo(0.003054, 5);
        expect(await svc.describe(3)).toEqual(pricing);
        expect(requests).toHaveLength(1);
        expect(await svc.describe(99)).toBeNull();
    });

    it('describes nothing when Spoolman is unreachable or not configured', async () => {
        serve({ ok: false });
        expect(await service().describe(3)).toBeNull();
        current = appSettingsSchema.parse({});
        expect(await service().describe(3)).toBeNull();
    });
});

describe('LocalSpoolService with Spoolman', () => {
    it('stops tracking local spools while Spoolman is the source of truth', async () => {
        const local = new LocalSpoolService(
            db.prisma,
            new PrintersService(db.prisma, {} as never),
            notifications,
            settings,
        );
        await db.client.localSpool.create({ data: { id: 'spool-a', name: 'PLA', material: 'PLA' } });
        await local.setAssignments('p1', { '0': 'spool-a' });
        expect(local.slotMap('p1').size).toBe(0);
        expect(local.active).toBe(false);
        current = appSettingsSchema.parse({});
        expect(local.active).toBe(true);
        expect(local.slotMap('p1').get(0)).toBe('spool-a');
    });
});

describe('LocalSpoolService simple inventory', () => {
    it('derives the density from the material instead of asking for it', async () => {
        const local = new LocalSpoolService(
            db.prisma,
            new PrintersService(db.prisma, {} as never),
            notifications,
            settings,
        );
        const petg = await local.create({ name: 'Black', material: 'PETG', initialWeightG: 1000, usedMm: 10_000 });
        expect(petg).not.toHaveProperty('price');
        expect(petg.usedG).toBeCloseTo(30.5, 0);
        const row = await db.client.localSpool.findUniqueOrThrow({ where: { id: petg.id } });
        expect(row.densityGcm3).toBe(1.27);
        await local.update(petg.id, { material: 'ABS' });
        expect((await db.client.localSpool.findUniqueOrThrow({ where: { id: petg.id } })).densityGcm3).toBe(1.04);
        await local.update(petg.id, { name: 'Renamed' });
        expect((await db.client.localSpool.findUniqueOrThrow({ where: { id: petg.id } })).densityGcm3).toBe(1.04);
    });
});
