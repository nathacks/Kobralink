import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { type AppSettings, appSettingsSchema } from '@kobralink/shared';
import { BadGatewayException } from '@nestjs/common';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import { EnergyService } from '../src/home-assistant/energy.service';
import { HaApiService } from '../src/home-assistant/ha-api.service';
import { HomeAssistantController } from '../src/home-assistant/home-assistant.controller';
import { installI18n, m } from '../src/i18n/locale';
import type { SettingsService } from '../src/settings/settings.service';
import { seedJob, seedPrinter, type TestDb, testDb } from './helpers/db';

installI18n();

const realFetch = globalThis.fetch;
let current: AppSettings = appSettingsSchema.parse({});
const settings = { get: () => current } as unknown as SettingsService;
const ha = () => new HaApiService(settings);
const configure = () => {
    current = appSettingsSchema.parse({ homeAssistant: { url: 'http://ha.test:8123/', token: 'tok' } });
};
const calls: { url: string; auth: string | null }[] = [];

function serve(routes: Record<string, () => Response>) {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, auth: new Headers(init.headers).get('authorization') });
        const path = new URL(url).pathname;
        const route = routes[path];
        if (!route) throw new TypeError('fetch failed');
        return route();
    }) as unknown as typeof fetch;
}

const json =
    (body: unknown, status = 200) =>
    () =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
    globalThis.fetch = realFetch;
    calls.length = 0;
    current = appSettingsSchema.parse({});
});

describe('HaApiService', () => {
    it('tests a connection with the given address and token', async () => {
        serve({ '/api/': json({ message: 'API running.' }) });
        expect(await ha().test({ url: 'http://ha.test:8123', token: 'abc' })).toEqual({
            ok: true,
            message: 'API running.',
        });
        expect(calls[0]).toEqual({ url: 'http://ha.test:8123/api/', auth: 'Bearer abc' });
    });

    it('explains a refused token, an HTTP error and an unreachable address', async () => {
        serve({ '/api/': json({}, 401) });
        expect(await ha().test({ url: 'http://ha.test', token: 'x' })).toEqual({
            ok: false,
            message: m.api_ha_unauthorized(),
        });
        serve({ '/api/': json({}, 500) });
        expect((await ha().test({ url: 'http://ha.test', token: 'x' })).message).toBe(
            m.api_ha_http_error({ status: '500' }),
        );
        serve({});
        expect((await ha().test({ url: 'http://ha.test', token: 'x' })).message).toBe(m.api_ha_unreachable());
    });

    it('lists the energy sensors in kWh, by name', async () => {
        configure();
        serve({
            '/api/states': json([
                { entity_id: 'sensor.plug_power', state: '120', attributes: { unit_of_measurement: 'W' } },
                {
                    entity_id: 'sensor.kobra_energy',
                    state: '1500',
                    attributes: { unit_of_measurement: 'Wh', friendly_name: 'Kobra plug energy' },
                },
                {
                    entity_id: 'sensor.attic_energy',
                    state: 'unavailable',
                    attributes: { device_class: 'energy', friendly_name: 'Attic' },
                },
                { entity_id: 'switch.kobra', state: 'on', attributes: { unit_of_measurement: 'kWh' } },
            ]),
        });
        expect(ha().configured()).toBe(true);
        expect(await ha().energySensors()).toEqual([
            { entityId: 'sensor.attic_energy', name: 'Attic', kwh: null },
            { entityId: 'sensor.kobra_energy', name: 'Kobra plug energy', kwh: 1.5 },
        ]);
        expect(calls[0].url).toBe('http://ha.test:8123/api/states');
    });

    it('reads one meter and refuses to call an unconfigured Home Assistant', async () => {
        await expect(ha().readKwh('sensor.kobra_energy')).rejects.toThrow(m.api_ha_not_configured());
        expect(ha().configured()).toBe(false);
        configure();
        serve({
            '/api/states/sensor.kobra_energy': json({ state: '12.5', attributes: { unit_of_measurement: 'kWh' } }),
        });
        expect(await ha().readKwh('sensor.kobra_energy')).toBe(12.5);
    });
});

describe('HomeAssistantController', () => {
    it('tests a connection and turns a failed sensor listing into a 502', async () => {
        const api = {
            test: mock(async () => ({ ok: true, message: '' })),
            energySensors: mock(async () => {
                throw new Error('down');
            }),
        };
        const ctrl = new HomeAssistantController(api as unknown as HaApiService);
        expect(await ctrl.test({ url: 'http://ha.test', token: 't' })).toEqual({ ok: true, message: '' });
        await expect(ctrl.energySensors()).rejects.toBeInstanceOf(BadGatewayException);
        api.energySensors.mockImplementationOnce(async () => []);
        expect(await ctrl.energySensors()).toEqual([]);
    });
});

describe('EnergyService', () => {
    let db: TestDb;
    const readings: (number | null)[] = [];
    const fakeHa = {
        configured: mock(() => true),
        readKwh: mock(async () => readings.shift() ?? null),
    };
    let svc: EnergyService;

    function bridge(energySensor = 'sensor.kobra_energy') {
        return Object.assign(new EventEmitter(), {
            id: 'p1',
            config: { name: 'Kobra 4' },
            settings: { energySensor },
        }) as unknown as PrinterBridge;
    }

    beforeAll(async () => {
        db = await testDb();
        await seedPrinter(db.client, 'p1');
        svc = new EnergyService(db.prisma, fakeHa as unknown as HaApiService);
    });

    afterAll(() => db.close());

    it('stores the energy a print used from the meter at its start and end', async () => {
        const job = await seedJob(db.client, 'p1', { status: 'printing', finishedAt: null });
        readings.push(100.25, 100.875);
        const b = bridge();
        await svc.onStart(b, job.id);
        await svc.onEnd(b, job.id);
        const row = await db.client.printJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(row).toMatchObject({ energyStartKwh: 100.25, energyKwh: 0.625 });
    });

    it('skips a print without a sensor, without Home Assistant, or with a meter that went back', async () => {
        const job = await seedJob(db.client, 'p1', { status: 'printing', finishedAt: null });
        await svc.onStart(bridge(''), job.id);
        fakeHa.configured.mockImplementationOnce(() => false);
        await svc.onStart(bridge(), job.id);
        expect(fakeHa.readKwh).toHaveBeenCalledTimes(2);
        readings.push(50, 10);
        await svc.onStart(bridge(), job.id);
        await svc.onEnd(bridge(), job.id);
        const row = await db.client.printJob.findUniqueOrThrow({ where: { id: job.id } });
        expect(row).toMatchObject({ energyStartKwh: 50, energyKwh: null });
        const fresh = await seedJob(db.client, 'p1', { status: 'printing', finishedAt: null });
        await svc.onEnd(bridge(), fresh.id);
        expect((await db.client.printJob.findUniqueOrThrow({ where: { id: fresh.id } })).energyKwh).toBeNull();
    });

    it('listens to the print start and end of a bridge and survives a failed reading', async () => {
        const job = await seedJob(db.client, 'p1', { status: 'printing', finishedAt: null });
        const b = bridge();
        svc.attach(b);
        readings.push(7);
        b.emit('job', 'start', job.id, 'part.gcode', null);
        await new Promise((r) => setTimeout(r, 20));
        fakeHa.readKwh.mockImplementationOnce(async () => {
            throw new Error('down');
        });
        b.emit('job', 'end', job.id, 'part.gcode', 'completed');
        await new Promise((r) => setTimeout(r, 20));
        readings.push(8);
        await svc.onEnd(b, job.id);
        expect((await db.client.printJob.findUniqueOrThrow({ where: { id: job.id } })).energyKwh).toBe(1);
        svc.detach('p1');
        b.emit('job', 'start', job.id, 'part.gcode', null);
        expect(b.listenerCount('job')).toBe(0);
    });
});
