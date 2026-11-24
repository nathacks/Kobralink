import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { InputRequiredResult } from '@modelcontextprotocol/server';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import { m } from '../src/i18n/locale';
import { type McpChat, McpService } from '../src/mcp/mcp.service';
import type { McpPrincipal } from '../src/mcp/mcp-auth.service';
import { McpControlTools } from '../src/mcp/mcp-control.tools';
import { McpQuestionService } from '../src/mcp/mcp-question.service';
import type { McpReadTools } from '../src/mcp/mcp-read.tools';
import { toolDto, toToolJson } from '../src/mcp/mcp-tool';

const state = { printState: 'standby', filename: 'a.gcode', connected: true };
const row = { maintenance: false, name: 'Kobra' };
let openJob: object | null = null;
let macroActions: { type: string }[] = [];

const bridge = {
    id: 'p1',
    config: { name: 'Kobra', ip: '127.0.0.1', httpPort: 7125 },
    settings: {},
    snapshot: () => state,
    printStoredFile: mock(async (_id: string, _options: object) => ({ filename: 'a.gcode' })),
    listPrinterFiles: mock(async () => ({
        files: [{ filename: 'b.gcode', sizeBytes: 42, folder: null }],
        testModels: [],
    })),
    printPrinterFile: mock(async () => undefined),
    moveAxis: mock(async () => undefined),
    disableSteppers: mock(() => undefined),
    amsFeed: mock(() => undefined),
    amsSetSlot: mock(() => undefined),
    aceDry: mock(() => undefined),
    skipObjects: mock(async () => undefined),
    resetSpoolUsage: mock(() => undefined),
};
const power = { configured: () => true, set: mock(async () => undefined) };
const spoolman = {
    listSpools: async () => [{ id: 5 }],
    slotMap: () => new Map([[0, 3]]),
    setSlotMap: mock(async () => ({})),
};
const queue = {
    startNext: mock(async () => ({ id: 'q1' })),
    confirmBedClear: mock(async () => ({})),
    list: async () => [{ id: 'a' }, { id: 'b' }],
    reorder: mock(async () => []),
};
const macros = { get: async () => ({ name: 'M', actions: macroActions }), run: mock(async () => undefined) };
const gcode = {
    findOpenJob: async () => openJob,
    getByFilename: async () => ({ id: 'f1' }),
    objects: async () => ({ names: ['cube'], svgB64: '', filename: 'a.gcode' }),
};

let modes: Record<string, string> = {};
let mcpEnabled = true;
const names = { gcodeFile: { findUnique: async () => ({ filename: 'cube.gcode' }) } };

function service(): McpService {
    const control = new McpControlTools(
        { get: () => bridge as unknown as PrinterBridge } as never,
        { findOne: async () => row } as never,
        gcode as never,
        power as never,
        {} as never,
        spoolman as never,
        queue as never,
        {} as never,
        {} as never,
        {} as never,
        macros as never,
        {} as never,
    );
    const settings = { get: () => ({ mcpEnabled, mcpTools: modes, locale: 'en' }) };
    return new McpService(
        { tools: [] } as unknown as McpReadTools,
        control,
        settings as never,
        new McpQuestionService(
            { client: names } as never,
            { has: () => true, get: () => bridge } as never,
            settings as never,
        ),
    );
}

const principal: McpPrincipal = { id: 'key:1', label: 'test', userId: 'u1', access: 'control' };
let mcp: McpService;

function parse(name: string, args: object) {
    const tool = mcp.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return { tool, parsed: tool.input.safeParse({ printerId: 'p1', ...args }) };
}

async function call(name: string, args: object = {}, chat: Partial<McpChat> = {}, who = principal) {
    const { tool, parsed } = parse(name, args);
    if (!parsed.success) throw parsed.error;
    const res = await mcp.call(who, tool, parsed.data, {
        canAsk: true,
        responses: undefined,
        approved: undefined,
        ...chat,
    });
    if (!('content' in res)) return { error: false, text: '', question: res as InputRequiredResult };
    const [content] = res.content as { type: string; text?: string }[];
    return { error: 'isError' in res, text: content.text ?? '', question: null };
}

const LOCKED: [string, object][] = [
    ['start_print', { fileId: 'f1', bedIsClear: true }],
    ['start_printer_file', { filename: 'b.gcode', bedIsClear: true }],
    ['start_next_in_queue', { bedIsClear: true }],
    ['confirm_bed_clear', { bedIsClear: true }],
    ['home_axes', { axis: 'all' }],
    ['move_axis', { axis: 'x', distance: 5 }],
    ['disable_motors', {}],
    ['set_power', { action: 'off' }],
    ['feed_filament', { slotIndex: 0, direction: 'in' }],
    ['start_drying', {}],
];

beforeEach(() => {
    Object.assign(state, { printState: 'standby', filename: 'a.gcode' });
    row.maintenance = false;
    openJob = null;
    macroActions = [];
    for (const m of [bridge.printStoredFile, bridge.moveAxis, power.set, macros.run, queue.reorder]) m.mockClear();
    mcp = service();
    modes = Object.fromEntries(mcp.tools.map((t) => [t.name, 'allow']));
    mcpEnabled = true;
});

describe('MCP control locks', () => {
    for (const [name, args] of LOCKED) {
        it(`${name} is refused while printing or paused`, async () => {
            for (const printState of ['printing', 'paused']) {
                state.printState = printState;
                const res = await call(name, args);
                expect(res.error).toBe(true);
                expect(res.text).toContain(printState);
            }
            state.printState = 'standby';
            expect((await call(name, args)).error).toBe(false);
        });
    }

    it('requires the bed confirmation, and nothing but true', () => {
        for (const name of ['start_print', 'start_printer_file', 'start_next_in_queue', 'confirm_bed_clear']) {
            const args = { fileId: 'f1', filename: 'b.gcode' };
            expect(parse(name, args).parsed.success).toBe(false);
            expect(parse(name, { ...args, bedIsClear: false }).parsed.success).toBe(false);
            expect(parse(name, { ...args, bedIsClear: true }).parsed.success).toBe(true);
        }
    });

    it('starts only one print when called twice, and allows a retry after a failure', async () => {
        const args = { fileId: 'f1', bedIsClear: true };
        const [a, b] = await Promise.all([call('start_print', args), call('start_print', args)]);
        expect([a.error, b.error].sort()).toEqual([false, true]);
        expect(bridge.printStoredFile).toHaveBeenCalledTimes(1);
        expect((await call('home_axes', { axis: 'z' })).error).toBe(true);
        mcp = service();
        bridge.printStoredFile.mockImplementationOnce(async () => {
            throw new Error('printer refused');
        });
        expect(await call('start_print', args)).toMatchObject({ error: true, text: 'printer refused' });
        expect((await call('start_print', args)).error).toBe(false);
    });

    it('does not start a print in maintenance mode', async () => {
        row.maintenance = true;
        expect((await call('start_print', { fileId: 'f1', bedIsClear: true })).error).toBe(true);
        expect(bridge.printStoredFile).not.toHaveBeenCalled();
    });

    it('keeps the plug on while a job is open on an offline printer, but can turn it on', async () => {
        state.printState = 'error';
        openJob = { id: 'j1' };
        expect((await call('set_power', { action: 'off' })).error).toBe(true);
        expect(power.set).not.toHaveBeenCalled();
        expect((await call('set_power', { action: 'on' })).error).toBe(false);
    });

    it('locks only the macros that move, feed or dry', async () => {
        state.printState = 'printing';
        macroActions = [{ type: 'light' }];
        expect((await call('run_macro', { macroId: 'm' })).text).toContain('done');
        for (const type of ['home', 'move', 'motorsOff', 'feed', 'dry']) {
            macroActions = [{ type: 'light' }, { type }];
            expect((await call('run_macro', { macroId: 'm' })).error).toBe(true);
        }
        expect(macros.run).toHaveBeenCalledTimes(1);
    });
});

describe('MCP control arguments', () => {
    it('moves in both directions', async () => {
        await call('move_axis', { axis: 'y', distance: -10 });
        expect(bridge.moveAxis).toHaveBeenLastCalledWith(2, 0, 10);
        expect(parse('move_axis', { axis: 'y', distance: 500 }).parsed.success).toBe(false);
    });

    it('converts the slot color', async () => {
        await call('set_filament_slot', { slotIndex: 1, material: 'PLA', colorHex: '#ff8001' });
        expect(bridge.amsSetSlot).toHaveBeenLastCalledWith(1, 'PLA', [255, 128, 1]);
    });

    it('keeps the other Spoolman slots and refuses an unknown spool', async () => {
        await call('assign_spool', { slotIndex: 2, source: 'spoolman', spoolId: '5' });
        expect(spoolman.setSlotMap).toHaveBeenLastCalledWith('p1', { '0': 3, '2': 5 });
        expect((await call('assign_spool', { slotIndex: 2, source: 'spoolman', spoolId: '9' })).error).toBe(true);
    });

    it('only skips known objects of the current print', async () => {
        expect((await call('skip_objects', { names: ['cube'] })).error).toBe(true);
        state.printState = 'printing';
        expect((await call('skip_objects', { names: ['nope'] })).error).toBe(true);
        expect((await call('skip_objects', { names: ['cube'] })).error).toBe(false);
    });

    it('refuses a partial reorder and an unknown printer file', async () => {
        expect((await call('reorder_queue', { ids: ['a'] })).error).toBe(true);
        expect((await call('reorder_queue', { ids: ['b', 'a'] })).error).toBe(false);
        expect((await call('start_printer_file', { filename: 'x.gcode', bedIsClear: true })).error).toBe(true);
    });
});

describe('MCP permissions', () => {
    const START = { fileId: 'f1', bedIsClear: true };
    const started = () => bridge.printStoredFile.mock.calls.length;

    it('asks by default for every destructive tool and allows the others', () => {
        for (const t of mcp.tools) expect(toolDto(t).defaultMode).toBe(t.destructive ? 'ask' : 'allow');
        expect(toolDto(parse('start_print', START).tool)).toMatchObject({ lock: 'always', bedClear: true });
        const locked = mcp.tools.filter((t) => t.lock === 'always').map((t) => t.name);
        expect(locked.sort()).toEqual(
            LOCKED.map(([n]) => n)
                .filter((n) => n !== 'set_power')
                .sort() as never,
        );
    });

    const reply = (action: string) => ({ confirm: { action } }) as unknown as McpChat['responses'];
    const signed = (args: object, id = 'key:1', tool = 'start_print') =>
        JSON.stringify([id, tool, parse(tool, args).parsed.data]);

    it('asks in the chat, shows what will run, and does nothing yet', async () => {
        modes.start_print = 'ask';
        const { question } = await call('start_print', START);
        const message = JSON.stringify(question?.inputRequests);
        expect(message).toContain(`${m.mcp_tool_start_print()} — Kobra`);
        expect(message).toContain('fileId: cube.gcode');
        expect(message).toContain(m.mcp_ask_bed());
        expect(started()).toBe(0);
    });

    it('runs on yes, and only on yes', async () => {
        modes.start_print = 'ask';
        const approved = signed(START);
        for (const action of ['decline', 'cancel']) {
            expect((await call('start_print', START, { responses: reply(action), approved })).text).toContain('no');
        }
        expect(started()).toBe(0);
        expect((await call('start_print', START, { responses: reply('accept'), approved })).error).toBe(false);
        expect(started()).toBe(1);
    });

    it('asks again when the yes was for another call or another assistant', async () => {
        modes.start_print = 'ask';
        const responses = reply('accept');
        for (const approved of [
            undefined,
            signed({ ...START, fileId: 'other' }),
            signed(START, 'key:2'),
            signed({ bedIsClear: true }, 'key:1', 'start_next_in_queue'),
        ]) {
            expect((await call('start_print', START, { responses, approved })).question).not.toBeNull();
        }
        expect(started()).toBe(0);
    });

    it('refuses when the application cannot ask', async () => {
        modes.start_print = 'ask';
        const res = await call('start_print', START, { canAsk: false });
        expect(res.error).toBe(true);
        expect(res.text).toContain('cannot ask');
        expect(started()).toBe(0);
    });

    it('still checks the printer, the permission and the switch after a yes', async () => {
        modes.start_print = 'ask';
        const yes = { responses: reply('accept'), approved: signed(START) };
        Object.assign(state, { printState: 'printing' });
        expect((await call('start_print', START, yes)).error).toBe(true);
        Object.assign(state, { printState: 'standby' });
        mcpEnabled = false;
        expect((await call('start_print', START, yes)).error).toBe(true);
        mcpEnabled = true;
        expect((await call('start_print', START, yes, { ...principal, access: 'read' })).error).toBe(true);
        modes.start_print = 'deny';
        expect((await call('start_print', START, yes)).error).toBe(true);
        expect(mcp.toolsFor(principal).some((t) => t.name === 'start_print')).toBe(false);
        expect(started()).toBe(0);
    });
});

describe('toToolJson', () => {
    it('drops camera, credentials and images at every level', () => {
        const json = toToolJson({ name: 'K', cameraUrl: 'u', a: [{ thumbnail: 't', ip: '1.2.3.4', password: 'p' }] });
        expect(JSON.parse(json)).toEqual({ name: 'K', a: [{}] });
        expect(toToolJson(undefined)).toBe('{"ok":true}');
    });
});
