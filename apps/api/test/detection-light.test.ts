import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { type FailureDetectionSettings, failureDetectionSettingsSchema } from '@kobralink/shared';
import type { PrinterBridge } from '../src/bridge/printer-bridge';
import { DetectionService } from '../src/detection/detection.service';
import type { NotificationService } from '../src/notifications/notification.service';
import type { SettingsService } from '../src/settings/settings.service';

class FakeBridge extends EventEmitter {
    readonly id = 'printer-1';
    readonly config = { name: 'Kobra 4' };
    readonly failureDetectionForJob = true;
    readonly state = { printState: 'printing', lightOn: false, filename: 'part.gcode' };
    readonly light: boolean[] = [];
    offline = false;
    readonly camera = {
        hasUrl: true,
        subscribe: () => () => undefined,
        waitForFrame: async () => Buffer.alloc(4),
    };
    readonly client = { startCamera: async () => undefined };

    snapshot() {
        return { ...this.state };
    }

    setLight(on: boolean) {
        if (this.offline) throw new Error('offline');
        this.light.push(on);
        this.state.lightOn = on;
    }
}

function setup(overrides: Partial<FailureDetectionSettings> = {}) {
    const cfg = failureDetectionSettingsSchema.parse({ enabled: true, ...overrides });
    const settings = { get: () => ({ failureDetection: cfg }), on: () => undefined } as unknown as SettingsService;
    const notifications = { emitCustom: () => undefined } as unknown as NotificationService;
    const svc = new DetectionService(settings, notifications);
    const internals = svc as unknown as {
        ensureModel: () => Promise<unknown>;
        watches: Map<string, unknown>;
        analyze: (w: unknown, cfg: FailureDetectionSettings) => Promise<void>;
        tick: () => Promise<void>;
        log: { log: () => void; warn: () => void };
    };
    internals.ensureModel = async () => ({ detect: async () => [] });
    internals.log = { log: () => undefined, warn: () => undefined };
    const bridge = new FakeBridge();
    svc.attach(bridge as unknown as PrinterBridge);
    const watch = internals.watches.get(bridge.id);
    const analyze = () => internals.analyze(watch, cfg);
    const pause = async () => {
        bridge.state.printState = 'paused';
        await internals.tick();
        bridge.state.printState = 'printing';
    };
    const tick = () => internals.tick();
    const loadModelThen = (change: () => void) => {
        internals.ensureModel = async () => {
            change();
            return { detect: async () => [] };
        };
    };
    const act = () => {
        const w = watch as { acted: boolean; unsubscribe: unknown };
        w.acted = true;
        w.unsubscribe = null;
    };
    return { svc, bridge, analyze, pause, tick, loadModelThen, act };
}

describe('camera light during failure detection', () => {
    it('turns the light on when detection starts watching and off when the print ends', async () => {
        const h = setup();
        await h.analyze();
        expect(h.bridge.light).toEqual([true]);
        await h.analyze();
        expect(h.bridge.light).toEqual([true]);
        h.bridge.emit('job', 'end');
        expect(h.bridge.light).toEqual([true, false]);
    });

    it('leaves a light that was already on as it is', async () => {
        const h = setup();
        h.bridge.state.lightOn = true;
        await h.analyze();
        h.bridge.emit('job', 'end');
        expect(h.bridge.light).toEqual([]);
        expect(h.bridge.state.lightOn).toBe(true);
    });

    it('does not touch the light when the setting is off', async () => {
        const h = setup({ light: false });
        await h.analyze();
        h.bridge.emit('job', 'end');
        expect(h.bridge.light).toEqual([]);
    });

    it('does not turn it off again when the user already did', async () => {
        const h = setup();
        await h.analyze();
        h.bridge.state.lightOn = false;
        h.bridge.emit('job', 'end');
        expect(h.bridge.light).toEqual([true]);
    });

    it('keeps the light on through a pause and a resume', async () => {
        const h = setup();
        await h.analyze();
        await h.pause();
        await h.analyze();
        expect(h.bridge.light).toEqual([true]);
        expect(h.bridge.state.lightOn).toBe(true);
    });

    it('turns the light off when the printer is removed', async () => {
        const h = setup();
        await h.analyze();
        h.svc.detach(h.bridge.id);
        expect(h.bridge.light).toEqual([true, false]);
    });

    it('does not turn the light on when the print ends while the model loads', async () => {
        const h = setup();
        h.loadModelThen(() => {
            h.bridge.state.printState = 'standby';
        });
        await h.analyze();
        expect(h.bridge.light).toEqual([]);
    });

    it('turns its light off once the printer stops printing, even without a job end', async () => {
        const h = setup();
        await h.analyze();
        h.bridge.state.printState = 'standby';
        await h.tick();
        expect(h.bridge.light).toEqual([true, false]);
        await h.tick();
        expect(h.bridge.light).toEqual([true, false]);
    });

    it('turns the light on again for the next print after it turned it off', async () => {
        const h = setup();
        await h.analyze();
        h.bridge.state.printState = 'standby';
        await h.tick();
        h.bridge.state.printState = 'printing';
        await h.analyze();
        expect(h.bridge.light).toEqual([true, false, true]);
    });

    it('leaves the light on after detection stopped the print, so the camera shows what happened', async () => {
        const h = setup();
        await h.analyze();
        h.act();
        h.bridge.state.printState = 'standby';
        await h.tick();
        h.bridge.emit('job', 'end');
        await h.tick();
        expect(h.bridge.light).toEqual([true]);
        expect(h.bridge.state.lightOn).toBe(true);
    });

    it('turns the light on again for a print after one detection stopped', async () => {
        const h = setup();
        await h.analyze();
        h.act();
        h.bridge.emit('job', 'end');
        h.bridge.state.lightOn = false;
        h.bridge.emit('job', 'start');
        await h.analyze();
        expect(h.bridge.light).toEqual([true, true]);
    });

    it('keeps watching when the light cannot be switched', async () => {
        const h = setup();
        h.bridge.offline = true;
        await h.analyze();
        h.bridge.offline = false;
        h.bridge.emit('job', 'end');
        expect(h.bridge.light).toEqual([]);
    });
});
