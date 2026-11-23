import { afterEach, describe, expect, it } from 'bun:test';
import { type AppSettings, appSettingsSchema, printerSettingsSchema } from '@kobralink/shared';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { BridgeRegistry } from '../src/bridge/bridge.registry';
import { HaApiService } from '../src/home-assistant/ha-api.service';
import { PowerService, parsePowerText } from '../src/home-assistant/power.service';
import { installI18n, m } from '../src/i18n/locale';
import { PrintersController } from '../src/printers/printers.controller';
import type { PrintersService } from '../src/printers/printers.service';
import type { SettingsService } from '../src/settings/settings.service';

installI18n();

const realFetch = globalThis.fetch;
const calls: { method: string; url: string; body: string | null }[] = [];
let switchState = 'off';
let current: AppSettings = appSettingsSchema.parse({ homeAssistant: { url: 'http://ha.test', token: 't' } });
const ha = new HaApiService({ get: () => current } as unknown as SettingsService);
const power = new PowerService(ha);

function serve(status = 200) {
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
        calls.push({ method: init.method ?? 'GET', url, body: (init.body as string) ?? null });
        const path = new URL(url).pathname;
        if (status !== 200) return new Response('', { status });
        if (path === '/api/states') {
            return Response.json([
                { entity_id: 'switch.kobra_plug', state: 'on', attributes: { friendly_name: 'Kobra plug' } },
                { entity_id: 'switch.attic', state: 'unavailable', attributes: {} },
                { entity_id: 'sensor.kobra_energy', state: '1', attributes: {} },
            ]);
        }
        if (path.startsWith('/api/states/')) return Response.json({ state: switchState });
        if (path.startsWith('/api/services/switch/')) return Response.json([]);
        if (path === '/tasmota') return new Response('{"POWER":"ON"}');
        return new Response('ok');
    }) as unknown as typeof fetch;
}

const ha_plug = printerSettingsSchema.parse({ plugSwitch: 'switch.kobra_plug' });
const urls = printerSettingsSchema.parse({
    powerOnUrl: 'http://plug.test/on',
    powerOffUrl: 'http://plug.test/off',
    powerStatusUrl: 'http://plug.test/tasmota',
});

afterEach(() => {
    globalThis.fetch = realFetch;
    calls.length = 0;
    current = appSettingsSchema.parse({ homeAssistant: { url: 'http://ha.test', token: 't' } });
});

describe('HaApiService switches', () => {
    it('lists the switches by name with their state', async () => {
        serve();
        expect(await ha.switches()).toEqual([
            { entityId: 'switch.kobra_plug', name: 'Kobra plug', on: true },
            { entityId: 'switch.attic', name: 'switch.attic', on: null },
        ]);
    });

    it('turns a switch on and off through the Home Assistant services', async () => {
        serve();
        await ha.setSwitch('switch.kobra_plug', true);
        await ha.setSwitch('switch.kobra_plug', false);
        expect(calls.map((c) => [c.method, new URL(c.url).pathname, c.body])).toEqual([
            ['POST', '/api/services/switch/turn_on', '{"entity_id":"switch.kobra_plug"}'],
            ['POST', '/api/services/switch/turn_off', '{"entity_id":"switch.kobra_plug"}'],
        ]);
    });
});

describe('PowerService', () => {
    it('drives the Home Assistant plug when one is chosen', async () => {
        serve();
        expect(power.configured(ha_plug)).toBe(true);
        await power.set(ha_plug, 'off');
        expect(calls[0].url).toBe('http://ha.test/api/services/switch/turn_off');
        switchState = 'on';
        expect(await power.state(ha_plug)).toBe('on');
        switchState = 'unavailable';
        expect(await power.state(ha_plug)).toBe('unknown');
    });

    it('needs Home Assistant configured to use the chosen plug', () => {
        current = appSettingsSchema.parse({});
        expect(power.configured(ha_plug)).toBe(false);
        expect(power.configured(printerSettingsSchema.parse({}))).toBe(false);
    });

    it('still drives the plug URLs set before', async () => {
        serve();
        expect(power.configured(urls)).toBe(true);
        await power.set(urls, 'on');
        expect(calls[0].url).toBe('http://plug.test/on');
        expect(await power.state(urls)).toBe('on');
        expect(await power.state({ ...urls, powerStatusUrl: '' })).toBe('unknown');
        await expect(power.set({ ...urls, powerOffUrl: '' }, 'off')).rejects.toThrow(m.api_no_plug());
    });

    it('reports an unreachable plug', async () => {
        serve(500);
        await expect(power.set(ha_plug, 'on')).rejects.toThrow(m.api_plug_unreachable());
        await expect(power.set(urls, 'on')).rejects.toThrow(m.api_plug_unreachable());
        globalThis.fetch = (async () => {
            throw new TypeError('fetch failed');
        }) as unknown as typeof fetch;
        await expect(power.state(ha_plug)).rejects.toThrow(m.api_plug_unreachable());
        await expect(power.state(urls)).rejects.toThrow(m.api_plug_unreachable());
    });

    it('reads Tasmota answers and plain text', () => {
        expect(parsePowerText('{"POWER":"OFF"}')).toBe('off');
        expect(parsePowerText('Relay is ON')).toBe('on');
        expect(parsePowerText('off')).toBe('off');
        expect(parsePowerText('???')).toBe('unknown');
    });
});

describe('PrintersController power', () => {
    const settings = { current: ha_plug };
    const registry = { get: () => ({ settings: settings.current }) } as unknown as BridgeRegistry;
    const ctrl = new PrintersController({} as PrintersService, registry, power);

    it('switches and reads the plug', async () => {
        serve();
        switchState = 'off';
        expect(await ctrl.power('p1', { action: 'on' })).toEqual({ state: 'on' });
        expect(await ctrl.powerStatus('p1')).toEqual({ state: 'off', configured: true });
    });

    it('refuses without a plug and turns an unreachable plug into a 503', async () => {
        settings.current = printerSettingsSchema.parse({});
        await expect(ctrl.power('p1', { action: 'on' })).rejects.toBeInstanceOf(BadRequestException);
        expect(await ctrl.powerStatus('p1')).toEqual({ state: 'unknown', configured: false });
        settings.current = ha_plug;
        serve(500);
        await expect(ctrl.power('p1', { action: 'off' })).rejects.toBeInstanceOf(ServiceUnavailableException);
        await expect(ctrl.powerStatus('p1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});
