import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationService } from '../src/automations/automation.service';
import type { BridgeRegistry } from '../src/bridge/bridge.registry';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import type { HaApiService } from '../src/home-assistant/ha-api.service';
import { PowerService } from '../src/home-assistant/power.service';
import { installI18n } from '../src/i18n/locale';
import type { MacroService } from '../src/macros/macro.service';
import type { NotificationService } from '../src/notifications/notification.service';
import type { QueueService } from '../src/queue/queue.service';
import { seedPrinter, type TestDb, testDb } from './helpers/db';

installI18n();

let db: TestDb;
let svc: AutomationService;
const notifications = Object.assign(new EventEmitter(), { emitCustom: mock(() => undefined) });
const queue = new EventEmitter();
const macroRun = mock(async () => undefined);
const macros = { get: async (id: string) => ({ id, name: 'Purge', actions: [] }), run: macroRun };
const realFetch = globalThis.fetch;
const fetched: string[] = [];

interface Fake {
    setLight: ReturnType<typeof mock>;
    amsFeed: ReturnType<typeof mock>;
    state: Record<string, unknown>;
}

const fakes = new Map<string, Fake>();

function fake(id: string, state: Record<string, unknown> = {}): Fake {
    const f: Fake = {
        setLight: mock(() => undefined),
        amsFeed: mock(() => undefined),
        state: { connected: true, printState: 'standby', nozzleTemp: 25, externalSpoolOnly: false, ...state },
    };
    fakes.set(id, f);
    return f;
}

const registry = {
    get: (id: string) => {
        const f = fakes.get(id);
        if (!f) throw new NotFoundException('no bridge');
        return {
            id,
            config: { name: `Kobra ${id}` },
            settings: { powerOnUrl: 'http://plug.test/on', powerOffUrl: 'http://plug.test/off' },
            snapshot: () => f.state,
            setLight: f.setLight,
            amsFeed: f.amsFeed,
        } as unknown as PrinterBridge;
    },
} as unknown as BridgeRegistry;

beforeAll(async () => {
    db = await testDb();
    await seedPrinter(db.client, 'p1', 'Kobra p1');
    await seedPrinter(db.client, 'p2', 'Kobra p2');
    await db.client.printer.update({
        where: { id: 'p1' },
        data: { settings: JSON.stringify({ profile: { tags: ['farm'] } }) },
    });
    await db.client.macro.create({ data: { id: 'm1', name: 'Purge', actions: '[]' } });
    svc = new AutomationService(
        db.prisma,
        registry,
        macros as unknown as MacroService,
        notifications as unknown as NotificationService,
        queue as unknown as QueueService,
        new PowerService({ configured: () => false } as unknown as HaApiService),
    );
    svc.sleep = async () => undefined;
});

afterAll(() => db.close());

beforeEach(async () => {
    await db.client.automationRule.deleteMany();
    fakes.clear();
    fake('p1');
    fake('p2');
    notifications.emitCustom.mockClear();
    macroRun.mockClear();
    fetched.length = 0;
    globalThis.fetch = (async (url: string) => {
        fetched.push(url);
        return new Response('ok', { status: url.includes('down') ? 500 : 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
    svc.onModuleDestroy();
});

const lightsOff = { name: 'Lights off', trigger: 'print_finished', actions: [{ type: 'light', on: false }] } as const;

describe('rules', () => {
    it('creates, lists, updates, switches and removes a rule', async () => {
        const rule = await svc.create(lightsOff);
        expect(rule).toMatchObject({ name: 'Lights off', enabled: true, printerId: null, lastRunAt: null });
        expect((await svc.list()).map((r) => r.id)).toEqual([rule.id]);
        const timed = await svc.update(rule.id, { ...lightsOff, trigger: 'time', time: '07:00', targetTags: ['farm'] });
        expect(timed).toMatchObject({ trigger: 'time', time: '07:00', targetTags: ['farm'] });
        const one = await svc.update(rule.id, { ...lightsOff, printerId: 'p1', targetTags: ['farm'], time: '07:00' });
        expect(one).toMatchObject({ printerId: 'p1', targetTags: [], time: '' });
        expect((await svc.setEnabled(rule.id, false)).enabled).toBe(false);
        await svc.remove(rule.id);
        expect(await svc.list()).toEqual([]);
    });

    it('refuses unknown rules, printers and macros', async () => {
        await expect(svc.get('nope')).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.update('nope', lightsOff)).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.create({ ...lightsOff, printerId: 'ghost' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            svc.create({ ...lightsOff, actions: [{ type: 'macro', macroId: 'gone' }] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect((await svc.create({ ...lightsOff, actions: [{ type: 'macro', macroId: 'm1' }] })).actions).toEqual([
            { type: 'macro', macroId: 'm1' },
        ]);
    });
});

describe('triggers', () => {
    it('runs the enabled rules that target the printer', async () => {
        await svc.create({ ...lightsOff, targetTags: ['farm'] });
        await svc.create({ ...lightsOff, name: 'Off', enabled: false });
        await svc.create({ ...lightsOff, name: 'Other', printerId: 'p2' });
        await svc.fire('print_finished', 'p1');
        expect(fakes.get('p1')?.setLight).toHaveBeenCalledTimes(1);
        expect(fakes.get('p2')?.setLight).not.toHaveBeenCalled();
        const [farm] = await svc.list();
        expect(farm.lastRunAt).not.toBeNull();
        expect(farm.lastError).toBe('');
        await svc.fire('print_finished', 'ghost');
        await svc.fire('bed_cleared', 'p1');
        expect(fakes.get('p1')?.setLight).toHaveBeenCalledTimes(1);
    });

    it('listens to print ends, low filament and cleared beds', async () => {
        await svc.create({ ...lightsOff, trigger: 'print_failed' });
        await svc.create({ ...lightsOff, name: 'Low', trigger: 'filament_low' });
        await svc.create({ ...lightsOff, name: 'Bed', trigger: 'bed_cleared' });
        svc.onModuleInit();
        const wait = () => new Promise((r) => setTimeout(r, 30));
        notifications.emit('notification', { type: 'print_cancelled', printerId: 'p1' });
        await wait();
        notifications.emit('notification', { type: 'alert_spool_low', printerId: 'p1' });
        await wait();
        queue.emit('bed_cleared', 'p1', 'good');
        await wait();
        notifications.emit('notification', { type: 'print_started', printerId: 'p1' });
        await wait();
        expect(fakes.get('p1')?.setLight).toHaveBeenCalledTimes(3);
        svc.onModuleDestroy();
        queue.emit('bed_cleared', 'p1', 'good');
        await wait();
        expect(fakes.get('p1')?.setLight).toHaveBeenCalledTimes(3);
    });

    it('runs time rules once in their minute on every targeted printer', async () => {
        await svc.create({ ...lightsOff, trigger: 'time', time: '07:30' });
        await svc.create({ ...lightsOff, name: 'Farm', trigger: 'time', time: '07:30', targetTags: ['farm'] });
        const at = new Date(2026, 9, 30, 7, 30, 5);
        await svc.tick(at);
        await svc.tick(new Date(2026, 9, 30, 7, 30, 40));
        await svc.tick(new Date(2026, 9, 30, 7, 31, 0));
        expect(fakes.get('p1')?.setLight).toHaveBeenCalledTimes(2);
        expect(fakes.get('p2')?.setLight).toHaveBeenCalledTimes(1);
    });
});

describe('actions', () => {
    it('runs a macro, feeds the ACE, notifies and waits', async () => {
        const rule = await svc.create({
            name: 'Swap',
            trigger: 'print_finished',
            actions: [
                { type: 'macro', macroId: 'm1' },
                { type: 'feed', slotIndex: 2, direction: 'out' },
                { type: 'wait', seconds: 5 },
                { type: 'notify', message: 'Spool unloaded' },
            ],
        });
        const after = await svc.runNow(rule.id, 'p1');
        expect(after.lastError).toBe('');
        expect(macroRun).toHaveBeenCalledTimes(1);
        expect(fakes.get('p1')?.amsFeed).toHaveBeenCalledWith(2, 2);
        expect(notifications.emitCustom).toHaveBeenCalledWith('p1', 'Kobra p1', 'automation', {
            rule: 'Swap',
            message: 'Spool unloaded',
        });
    });

    it('stops at the first failing action and keeps the error', async () => {
        fake('p1', { externalSpoolOnly: true });
        const rule = await svc.create({
            name: 'Load',
            trigger: 'print_finished',
            actions: [
                { type: 'feed', slotIndex: 0, direction: 'in' },
                { type: 'light', on: true },
            ],
        });
        const after = await svc.runNow(rule.id, 'p1');
        expect(after.lastError).not.toBe('');
        expect(fakes.get('p1')?.setLight).not.toHaveBeenCalled();
        await expect(svc.runNow(rule.id, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
        await expect(svc.runNow('nope', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('powers off only once the printer is idle and the nozzle is cool', async () => {
        const off = await svc.create({
            name: 'Off',
            trigger: 'print_finished',
            actions: [{ type: 'power', action: 'off' }],
        });
        const p1 = fake('p1', { nozzleTemp: 200 });
        let polls = 0;
        svc.sleep = async () => {
            polls += 1;
            p1.state.nozzleTemp = 40;
        };
        expect((await svc.runNow(off.id, 'p1')).lastError).toBe('');
        expect(polls).toBe(1);
        expect(fetched).toEqual(['http://plug.test/off']);
        fake('p1', { printState: 'printing' });
        expect((await svc.runNow(off.id, 'p1')).lastError).not.toBe('');
        expect(fetched).toHaveLength(1);
        svc.sleep = async () => undefined;
    });

    it('powers on even when the printer is offline and reports an unreachable plug', async () => {
        const on = await svc.create({
            name: 'On',
            trigger: 'time',
            time: '06:00',
            actions: [{ type: 'power', action: 'on' }],
        });
        fake('p1', { connected: false });
        expect((await svc.runNow(on.id, 'p1')).lastError).toBe('');
        expect(fetched).toEqual(['http://plug.test/on']);
        globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
        expect((await svc.runNow(on.id, 'p1')).lastError).not.toBe('');
    });
});
