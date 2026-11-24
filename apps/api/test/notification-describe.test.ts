import { describe, expect, it, mock } from 'bun:test';
import { type AppSettings, appSettingsSchema, eventLinkPath as linkPath } from '@kobralink/shared';
import { installI18n } from '../src/i18n/locale';
import { eventUrl, headerValue, NotificationService } from '../src/notifications/notification.service';
import type { PushService } from '../src/notifications/push.service';
import type { SettingsService } from '../src/settings/settings.service';

const noPush = { hasSubscribers: async () => false } as unknown as PushService;

installI18n();

function service(overrides: Record<string, unknown> = {}) {
    const current: AppSettings = appSettingsSchema.parse({ locale: 'en', ...overrides });
    const svc = new NotificationService({ get: () => current } as unknown as SettingsService, noPush);
    const deliver = mock(async () => ({ delivered: [], failed: [] }));
    (svc as unknown as { deliver: typeof deliver }).deliver = deliver;
    return { svc, deliver };
}

describe('notification texts', () => {
    it('describes the queue hold with and without the bed-clear confirmation', () => {
        const { svc } = service();
        const held = svc.build('p1', 'Kobra', 'queue_next', { filename: 'a.gcode', bedClear: true });
        expect(held.title).toBe('Kobra — queue');
        expect(held.body).toBe('Next file ready: a.gcode. Confirm the bed is clear to start it.');
        const plain = svc.build('p1', 'Kobra', 'queue_next', { filename: 'a.gcode', bedClear: false });
        expect(plain.body).toBe('Next file ready: a.gcode. Clear the bed, then start it.');
    });

    it('describes an item held for lack of filament', () => {
        const { svc } = service();
        const held = svc.build('p1', 'Kobra', 'queue_filament', { filename: 'a.gcode' });
        expect(held.title).toBe('Kobra — queue');
        expect(held.body).toBe('a.gcode is on hold: the loaded filament will not last. Load or change a spool.');
    });

    it('describes the three outcomes of a scheduled print', () => {
        const { svc } = service();
        const base = { filename: 'lid.gcode' };
        expect(svc.build('p1', 'Kobra', 'scheduled_print', { ...base, result: 'started' })).toMatchObject({
            title: 'Kobra — scheduled print',
            body: 'lid.gcode started as scheduled.',
        });
        expect(svc.build('p1', 'Kobra', 'scheduled_print', { ...base, result: 'queued' }).body).toBe(
            'lid.gcode could not start (printer busy or offline): added to the front of the queue.',
        );
        expect(svc.build('p1', 'Kobra', 'scheduled_print', { ...base, result: 'failed', error: 'boom' }).body).toBe(
            'lid.gcode could not start: boom',
        );
        expect(svc.build('p1', 'Kobra', 'scheduled_print', base).body).toBe('lid.gcode started as scheduled.');
    });

    it('describes a due maintenance task with its usage', () => {
        const { svc } = service();
        const ev = svc.build('p1', 'Kobra', 'maintenance_due', { task: 'Clean the nozzle', hours: 52, jobs: 9 });
        expect(ev.title).toBe('Kobra — maintenance due');
        expect(ev.body).toBe('Clean the nozzle: 52 h and 9 prints since the last time.');
        expect(svc.build('p1', 'Kobra', 'maintenance_due', {}).body).toBe(': 0 h and 0 prints since the last time.');
    });

    it('names a recommended task in the configured language', () => {
        const fr = service({ locale: 'fr' }).svc;
        const ev = fr.build('p1', 'Kobra', 'maintenance_due', { task: 'Clean the nozzle', presetKey: 'clean_nozzle' });
        expect(ev.body.startsWith('Nettoyer la buse')).toBe(true);
        const custom = fr.build('p1', 'Kobra', 'maintenance_due', { task: 'Graisser', presetKey: '' });
        expect(custom.body.startsWith('Graisser')).toBe(true);
    });

    it('explains a known pause code in the configured language', () => {
        const msg = 'Filament entanglement or jam detected, please manually straighten the filament';
        const en = service().svc.build('p1', 'Kobra', 'print_paused', { code: 11842, msg });
        expect(en.body).toBe('[11842] Filament tangle or jam detected; straighten the filament by hand');
        const pt = service({ locale: 'pt-br' }).svc.build('p1', 'Kobra', 'print_paused', { code: 11842, msg });
        expect(pt.body).toBe('[11842] Filamento enroscado ou travado; desenrosque à mão');
    });

    it('keeps the printer message for an unknown pause code', () => {
        const ev = service().svc.build('p1', 'Kobra', 'print_paused', { code: 19999, msg: 'Something new' });
        expect(ev.body).toBe('[19999] Something new');
    });

    it('follows the configured locale', () => {
        const { svc } = service({ locale: 'fr' });
        expect(svc.build('p1', 'Kobra', 'queue_next', { filename: 'a.gcode' }).title).toBe("Kobra — file d'attente");
        expect(svc.build('p1', 'Kobra', 'maintenance_due', { task: 'x' }).title).toBe('Kobra — entretien à faire');
    });
});

describe('notification delivery flags', () => {
    it('delivers the new events only when their switch is on', () => {
        const { svc, deliver } = service({
            notifications: { events: { scheduledPrint: false, maintenanceDue: true, queueNext: true } },
        });
        const seen: string[] = [];
        svc.on('notification', (ev) => seen.push(ev.type));
        svc.emitCustom('p1', 'Kobra', 'scheduled_print', { filename: 'a', result: 'started' });
        svc.emitCustom('p1', 'Kobra', 'maintenance_due', { task: 't' });
        svc.emitCustom('p1', 'Kobra', 'queue_next', { filename: 'a', bedClear: true });
        expect(seen).toEqual(['scheduled_print', 'maintenance_due', 'queue_next']);
        expect(deliver).toHaveBeenCalledTimes(2);
        const types = deliver.mock.calls.map((c) => (c as unknown as [{ type: string }])[0].type);
        expect(types).toEqual(['maintenance_due', 'queue_next']);
    });

    it('turns both new events on by default', () => {
        const { svc, deliver } = service();
        svc.emitCustom('p1', 'Kobra', 'scheduled_print', { filename: 'a' });
        svc.emitCustom('p1', 'Kobra', 'maintenance_due', { task: 't' });
        expect(deliver).toHaveBeenCalledTimes(2);
    });
});

describe('automation notifications', () => {
    it('titles the message with the printer and the rule', () => {
        const { svc } = service();
        expect(svc.build('p1', 'Kobra', 'automation', { rule: 'Night', message: 'Lights off' })).toMatchObject({
            title: 'Kobra — Night',
            body: 'Lights off',
        });
    });

    it('is delivered under its own switch, on by default', () => {
        const on = service();
        on.svc.emitCustom('p1', 'Kobra', 'automation', { rule: 'r', message: 'm' });
        expect(on.deliver).toHaveBeenCalledTimes(1);
        const off = service({ notifications: { events: { automation: false } } });
        off.svc.emitCustom('p1', 'Kobra', 'automation', { rule: 'r', message: 'm' });
        expect(off.deliver).not.toHaveBeenCalled();
    });
});

describe('notification links', () => {
    it('points each event at the screen that handles it', () => {
        expect(linkPath('print_finished', 'p1')).toBe('/printers/p1');
        expect(linkPath('alert_print_failure', 'p1')).toBe('/printers/p1');
        expect(linkPath('printer_offline', '')).toBe('/printers');
        expect(linkPath('queue_next', 'p1')).toBe('/queue');
        expect(linkPath('queue_filament', 'p1')).toBe('/queue');
        expect(linkPath('scheduled_print', 'p1')).toBe('/queue');
        expect(linkPath('maintenance_due', 'p1')).toBe('/maintenance');
        expect(linkPath('alert_spool_low', 'p1')).toBe('/filament');
        expect(linkPath('automation', 'p1')).toBe('/automations');
    });

    it('builds the link from Kobralink own address, or none without it', () => {
        expect(eventUrl('http://kobralink.lan:7100/', 'queue_next', 'p1')).toBe('http://kobralink.lan:7100/queue');
        expect(eventUrl('', 'queue_next', 'p1')).toBeUndefined();
        expect(service({ publicUrl: 'http://kobralink.lan' }).svc.build('p1', 'K', 'print_finished', {}).url).toBe(
            'http://kobralink.lan/printers/p1',
        );
        expect(service().svc.build('p1', 'K', 'print_finished', {}).url).toBeUndefined();
    });

    it('adds the link to Discord, Telegram, ntfy and the webhook', async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return new Response('', { status: 200 });
        }) as unknown as typeof fetch;
        try {
            const current = appSettingsSchema.parse({
                locale: 'en',
                publicUrl: 'http://kobralink.lan',
                notifications: {
                    webhookUrl: 'http://hook.test/',
                    discordUrl: 'http://discord.test/',
                    telegramToken: 'token',
                    telegramChatId: '42',
                    ntfyUrl: 'http://ntfy.test/kobralink',
                },
            });
            const svc = new NotificationService({ get: () => current } as unknown as SettingsService, noPush);
            svc.emitCustom('p1', 'Kobra', 'queue_next', { filename: 'a.gcode' });
            await new Promise((r) => setTimeout(r, 20));
            const body = (host: string) => String(calls.find((c) => c.url.includes(host))?.init.body ?? '');
            const headers = (host: string) =>
                (calls.find((c) => c.url.includes(host))?.init.headers ?? {}) as Record<string, string>;
            expect(JSON.parse(body('hook.test')).url).toBe('http://kobralink.lan/queue');
            expect(JSON.parse(body('discord.test')).embeds[0].url).toBe('http://kobralink.lan/queue');
            expect(JSON.parse(body('discord.test')).embeds[0].description).toContain(
                '[Open in Kobralink](http://kobralink.lan/queue)',
            );
            expect(JSON.parse(body('api.telegram.org')).text).toContain(
                '[Open in Kobralink](http://kobralink.lan/queue)',
            );
            expect(headers('ntfy.test').Click).toBe('http://kobralink.lan/queue');
            expect(headers('ntfy.test').Actions).toBe('view, Open in Kobralink, http://kobralink.lan/queue');
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});

describe('headerValue', () => {
    it('keeps plain text and encodes the rest for ntfy headers', () => {
        expect(headerValue('Kobra - queue')).toBe('Kobra - queue');
        expect(headerValue('Kobra — fila')).toBe(`=?UTF-8?B?${Buffer.from('Kobra — fila').toString('base64')}?=`);
    });
});

describe('push channel', () => {
    it('sends to subscribed devices and reports the channel only when one exists', async () => {
        const current = appSettingsSchema.parse({ locale: 'en' });
        const sent: unknown[] = [];
        let subscribed = false;
        const push = {
            hasSubscribers: async () => subscribed,
            send: async (e: unknown) => void sent.push(e),
        } as unknown as PushService;
        const svc = new NotificationService({ get: () => current } as unknown as SettingsService, push);
        expect(await svc.test()).toEqual({ delivered: [], failed: [] });
        subscribed = true;
        expect(await svc.test()).toEqual({ delivered: ['push'], failed: [] });
        expect(sent).toHaveLength(1);
    });
});
