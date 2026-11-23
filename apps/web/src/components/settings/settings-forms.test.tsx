import { type AppSettings, appSettingsSchema, printerSettingsSchema } from '@kobralink/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrinterSettingsForm } from '@/components/printer/settings-form';
import { usePrinter } from '@/hooks/use-printers';
import type { PrinterWithLive } from '@/lib/api';
import { installI18n, m } from '@/lib/i18n';
import { printersStore } from '@/stores/printers';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { COSTS_KEYS, CostsCard } from './costs-card';
import { DetectionCard } from './detection-card';
import { DryPresetsCard } from './dry-presets-card';
import { GENERAL_KEYS, GeneralCard } from './general-card';
import { HaMqttCard } from './ha-mqtt-card';
import { NotificationsCard } from './notifications-card';
import { SPOOLMAN_KEYS, SpoolmanCard } from './spoolman-card';

const mocks = vi.hoisted(() => ({
    save: vi.fn(),
    settingsUpdate: vi.fn(),
    printerUpdate: vi.fn(),
}));

vi.mock('@/hooks/use-save-settings', () => ({
    useSaveSettings: () => ({ mutateAsync: mocks.save, isPending: false }),
}));

vi.mock('@/lib/api', () => {
    const group = (fns: Record<string, unknown> = {}) =>
        new Proxy(fns, {
            get: (target, key: string) => {
                if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
                return target[key];
            },
        });
    const known: Record<string, unknown> = {
        settings: { update: mocks.settingsUpdate },
        printers: {
            update: mocks.printerUpdate,
            connect: vi.fn(),
            disconnect: vi.fn(),
            reconnect: vi.fn(),
            refreshCredentials: vi.fn(),
            remove: vi.fn(),
        },
        spoolman: { health: vi.fn().mockResolvedValue({ reachable: true, configured: true }) },
        detection: {
            status: vi.fn().mockResolvedValue({
                model: { state: 'ready', progress: 1, downloadedBytes: 0, sizeBytes: 0, error: '' },
                runtimeAvailable: true,
                runtimeError: '',
                printers: {},
            }),
            download: vi.fn(),
            cancelDownload: vi.fn(),
            deleteModel: vi.fn(),
        },
        events: { test: vi.fn() },
    };
    return {
        api: new Proxy(known, {
            get: (target, key: string) => {
                if (!(key in target)) target[key] = {};
                return group(target[key] as Record<string, unknown>);
            },
        }),
    };
});

vi.mock('@/lib/queries', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/queries')>();
    return {
        ...actual,
        filamentVendorsQuery: { queryKey: ['vendors'], queryFn: async () => [] },
        detectionStatusQuery: {
            queryKey: ['detection'],
            queryFn: async () => ({
                model: { state: 'ready', progress: 1, downloadedBytes: 0, sizeBytes: 0, error: '' },
                runtimeAvailable: true,
                runtimeError: '',
                printers: {},
            }),
        },
    };
});

const stored: AppSettings = appSettingsSchema.parse({
    locale: 'en',
    currency: 'BRL',
    filamentPricePerKg: 89.41,
    costs: { energyPricePerKwh: 0.3, printerPowerW: 150 },
    updateCheck: false,
    verboseHttpLog: true,
    spoolmanUrl: 'http://spoolman.test:7912',
    spoolmanSyncRateSec: 30,
    notifications: {
        browser: false,
        discordUrl: 'https://discord.test/api/webhooks/1/abc',
        ntfyUrl: 'https://ntfy.test/printer',
        webhookUrl: 'https://hooks.test/print',
        telegramToken: '123:abc',
        telegramChatId: '42',
        events: { printStarted: false, printFinished: true, alerts: false, scheduledPrint: false },
    },
    haMqtt: {
        enabled: true,
        url: 'mqtt://broker.test:1883',
        username: 'ha',
        password: 'secret',
        topicPrefix: 'printers',
        discoveryPrefix: 'ha',
    },
    failureDetection: { enabled: true, action: 'pause', sensitivity: 1.4, intervalSec: 15 },
    aceDryPresets: [{ name: 'PETG', targetTemp: 55, duration: 300 }],
});

async function saveUnchanged(ui: ReactNode, submit: ReturnType<typeof vi.fn>) {
    await renderWithProviders(ui);
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    return submit.mock.calls[0][0] as Record<string, unknown>;
}

function expectSection(payload: Record<string, unknown>, keys: (keyof AppSettings)[]) {
    expect(Object.keys(payload).sort()).toEqual([...keys].sort());
    for (const key of keys) expect({ [key]: payload[key] }).toEqual({ [key]: stored[key] });
}

beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue(stored);
    mocks.settingsUpdate.mockReset().mockResolvedValue(stored);
    mocks.printerUpdate.mockReset().mockResolvedValue({});
});

describe('saving a settings card without edits keeps every stored value', () => {
    it('general', async () => {
        const payload = await saveUnchanged(<GeneralCard settings={stored} />, mocks.save);
        expectSection(payload, [...GENERAL_KEYS]);
    });

    it('notifications', async () => {
        const payload = await saveUnchanged(<NotificationsCard settings={stored} />, mocks.save);
        expectSection(payload, ['notifications']);
    });

    it('costs', async () => {
        const payload = await saveUnchanged(<CostsCard settings={stored} />, mocks.save);
        expectSection(payload, [...COSTS_KEYS]);
    });

    it('Home Assistant', async () => {
        const payload = await saveUnchanged(<HaMqttCard settings={stored} />, mocks.save);
        expectSection(payload, ['haMqtt']);
    });

    it('failure detection', async () => {
        const payload = await saveUnchanged(<DetectionCard settings={stored} />, mocks.save);
        expectSection(payload, ['failureDetection']);
    });

    it('ACE drying presets', async () => {
        const payload = await saveUnchanged(<DryPresetsCard settings={stored} />, mocks.save);
        expectSection(payload, ['aceDryPresets']);
    });

    it('Spoolman', async () => {
        const payload = await saveUnchanged(<SpoolmanCard settings={stored} />, mocks.settingsUpdate);
        expectSection(payload, [...SPOOLMAN_KEYS]);
    });

    it('printer settings', async () => {
        const settings = printerSettingsSchema.parse({
            timelapseEnabled: true,
            timelapseFps: 60,
            vibrationCompensation: true,
            cameraOnPrint: true,
            cameraUrl: 'rtsp://camera.test/stream1',
            alerts: { spoolLowG: 100, offlineMinutes: 5 },
            queueBedClearConfirm: true,
        });
        const printer = {
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.235',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings,
            live: null,
        } as unknown as PrinterWithLive;
        await renderWithProviders(<PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />);
        await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
        await waitFor(() => expect(mocks.printerUpdate).toHaveBeenCalledOnce());
        const [id, body] = mocks.printerUpdate.mock.calls[0];
        expect(id).toBe('p1');
        expect(body.settings).toEqual(settings);
    });
});

function StoredPrinterForm({ id }: { id: string }) {
    const printer = usePrinter(id);
    if (!printer) return null;
    return <PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />;
}

function switchAfter(label: string): HTMLElement {
    const el = screen.getByText(label).closest('div.flex')?.querySelector('[role="switch"]');
    if (!el) throw new Error(`no switch for ${label}`);
    return el as HTMLElement;
}

describe('editing the new settings', () => {
    it('sends the edited cost values', async () => {
        await renderWithProviders(<CostsCard settings={stored} />);
        const energy = screen.getByLabelText(m.settings_energy_price());
        await userEvent.clear(energy);
        await userEvent.type(energy, '0.5');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
        expect(mocks.save.mock.calls[0][0]).toEqual({
            costs: { energyPricePerKwh: 0.5, printerPowerW: 150 },
        });
    });

    it('no longer asks for a machine rate', async () => {
        await renderWithProviders(<CostsCard settings={stored} />);
        expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    });

    it('lists the scheduled print and maintenance events and saves their switches', async () => {
        await renderWithProviders(<NotificationsCard settings={stored} />);
        expect(switchAfter(m.notif_ev_scheduled_print()).getAttribute('aria-checked')).toBe('false');
        expect(switchAfter(m.notif_ev_maintenance_due()).getAttribute('aria-checked')).toBe('true');
        await userEvent.click(switchAfter(m.notif_ev_maintenance_due()));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
        const payload = mocks.save.mock.calls[0][0] as AppSettings;
        expect(payload.notifications.events.maintenanceDue).toBe(false);
        expect(payload.notifications.events.scheduledPrint).toBe(false);
    });

    it('turns the bed-clear confirmation off for a printer', async () => {
        const settings = printerSettingsSchema.parse({ queueAutoStart: true, queueBedClearConfirm: true });
        const printer = {
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.235',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings,
            live: null,
        } as unknown as PrinterWithLive;
        await renderWithProviders(<PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />);
        expect(switchAfter(m.settings_queue_bed_clear()).getAttribute('aria-checked')).toBe('true');
        await userEvent.click(switchAfter(m.settings_queue_bed_clear()));
        await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
        await waitFor(() => expect(mocks.printerUpdate).toHaveBeenCalledOnce());
        expect(mocks.printerUpdate.mock.calls[0][1].settings.queueBedClearConfirm).toBe(false);
        expect(mocks.printerUpdate.mock.calls[0][1].settings.queueAutoStart).toBe(true);
    });

    it('turns the light trigger on for a printer', async () => {
        const printer = {
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.235',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings: printerSettingsSchema.parse({}),
            live: null,
        } as unknown as PrinterWithLive;
        printersStore.actions.upsertPrinter(printer);
        mocks.printerUpdate.mockImplementation(async (_id: string, body: { settings: unknown }) => ({
            ...printer,
            settings: body.settings,
        }));
        await renderWithProviders(<StoredPrinterForm id="p1" />);
        expect(switchAfter(m.settings_light_trigger()).getAttribute('aria-checked')).toBe('false');
        await userEvent.click(switchAfter(m.settings_light_trigger()));
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(mocks.printerUpdate).toHaveBeenCalledOnce());
        expect(mocks.printerUpdate.mock.calls[0][1].settings.lightTrigger).toBe(true);
        expect(mocks.printerUpdate.mock.calls[0][1].settings.queueAutoStart).toBe(true);
        await waitFor(() => expect(screen.queryByText(m.form_unsaved())).toBeNull());
    });

    it('explains the queue mode, sets the wait and keeps the light trigger tied to auto-start', async () => {
        const printer = {
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.235',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings: printerSettingsSchema.parse({}),
            live: null,
        } as unknown as PrinterWithLive;
        await renderWithProviders(<PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />);
        expect(screen.getByRole('note').textContent).toBe(m.queue_mode_manual_confirm());
        expect(screen.queryByLabelText(m.settings_queue_delay())).toBeNull();
        await userEvent.click(switchAfter(m.settings_light_trigger()));
        expect(switchAfter(m.settings_queue_auto_start()).getAttribute('aria-checked')).toBe('true');
        const delay = screen.getByLabelText(m.settings_queue_delay()) as HTMLInputElement;
        expect(delay.value).toBe('15');
        await userEvent.clear(delay);
        await userEvent.type(delay, '30');
        expect(screen.getByRole('note').textContent).toBe(
            m.queue_mode_auto_confirm({ when: m.queue_when_after({ seconds: 30 }), how: m.queue_mode_how_light() }),
        );
        await userEvent.click(switchAfter(m.settings_queue_auto_start()));
        expect(switchAfter(m.settings_light_trigger()).getAttribute('aria-checked')).toBe('false');
        expect(screen.queryByLabelText(m.settings_queue_delay())).toBeNull();
        await userEvent.click(switchAfter(m.settings_queue_auto_start()));
        await userEvent.click(screen.getByRole('button', { name: m.common_save() }));
        await waitFor(() => expect(mocks.printerUpdate).toHaveBeenCalledOnce());
        expect(mocks.printerUpdate.mock.calls[0][1].settings).toMatchObject({
            queueAutoStart: true,
            queueAutoStartDelaySec: 30,
            lightTrigger: false,
        });
    });

    it('shows the plug card only when Home Assistant is set up', async () => {
        const printer = {
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.235',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings: printerSettingsSchema.parse({}),
            live: null,
        } as unknown as PrinterWithLive;
        const without = await renderWithProviders(
            <PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />,
        );
        expect(screen.queryByText(m.plug_title())).toBeNull();
        expect(screen.queryByText('http://192.168.1.50/cm?cmnd=Power%20On')).toBeNull();
        without.unmount();
        const qc = testQueryClient();
        qc.setQueryData(
            ['settings'],
            appSettingsSchema.parse({ homeAssistant: { url: 'http://ha.local:8123', token: 't' } }),
        );
        await renderWithProviders(<PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />, {
            queryClient: qc,
        });
        expect(screen.getByText(m.plug_title())).toBeTruthy();
        expect(screen.getByRole('combobox', { name: m.plug_switch() })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: m.energy_sensor() })).toBeTruthy();
    });

    it('shows the save bar on a printer change and discards it', async () => {
        const printer = {
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.235',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings: printerSettingsSchema.parse({}),
            live: null,
        } as unknown as PrinterWithLive;
        await renderWithProviders(<PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />);
        expect(screen.queryByText(m.form_unsaved())).toBeNull();
        await userEvent.click(switchAfter(m.settings_light_trigger()));
        expect(await screen.findByText(m.form_unsaved())).toBeTruthy();
        await userEvent.click(screen.getByRole('button', { name: m.form_discard() }));
        expect(switchAfter(m.settings_light_trigger()).getAttribute('aria-checked')).toBe('false');
        expect(screen.queryByText(m.form_unsaved())).toBeNull();
        expect(mocks.printerUpdate).not.toHaveBeenCalled();
    });
});

describe('camera light during failure detection', () => {
    beforeAll(() => installI18n());

    it('is on by default and saves the choice to turn it off', async () => {
        await renderWithProviders(<DetectionCard settings={stored} />);
        const light = switchAfter(m.detection_light());
        expect(light.getAttribute('aria-checked')).toBe('true');
        await userEvent.click(light);
        await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
        await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
        expect(mocks.save.mock.calls[0][0]).toEqual({ failureDetection: { ...stored.failureDetection, light: false } });
    });
});

describe('Kobralink address', () => {
    beforeAll(() => installI18n());

    it('fills in the address this page is open on', async () => {
        await renderWithProviders(<GeneralCard settings={stored} />);
        await userEvent.click(screen.getByRole('button', { name: m.settings_public_url_current() }));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
        expect(mocks.save.mock.calls[0][0]).toMatchObject({ publicUrl: window.location.origin });
    });

    it('refuses an address that is not a URL', async () => {
        await renderWithProviders(<GeneralCard settings={stored} />);
        await userEvent.type(screen.getByLabelText(m.settings_public_url()), 'kobralink.local');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByText(m.validation_url())).toBeTruthy();
        expect(mocks.save).not.toHaveBeenCalled();
    });
});

describe('flow calibration setting', () => {
    it('is on by default and can be turned off for a printer', async () => {
        const settings = printerSettingsSchema.parse({});
        expect(settings.flowCalibration).toBe(true);
        const printer = {
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.235',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings,
            live: null,
        } as unknown as PrinterWithLive;
        await renderWithProviders(<PrinterSettingsForm printer={printer} onSaved={vi.fn()} onDeleted={vi.fn()} />);
        const flow = switchAfter(m.settings_flow_calibration());
        expect(flow.getAttribute('aria-checked')).toBe('true');
        await userEvent.click(flow);
        await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
        await waitFor(() => expect(mocks.printerUpdate).toHaveBeenCalledOnce());
        expect(mocks.printerUpdate.mock.calls[0][1].settings.flowCalibration).toBe(false);
    });
});

describe('print options the printer reports', () => {
    const printerWith = (live: unknown) =>
        ({
            id: 'p1',
            name: 'Kobra 4',
            ip: '192.168.1.50',
            httpPort: 7125,
            deviceId: 'abcdef123456',
            modeId: '20028',
            username: 'user',
            createdAt: '2026-10-20T00:00:00.000Z',
            model: 'Anycubic Kobra 4',
            settings: printerSettingsSchema.parse({}),
            live,
        }) as unknown as PrinterWithLive;

    it('shows the three options while the features are unknown', async () => {
        await renderWithProviders(
            <PrinterSettingsForm printer={printerWith({ features: null })} onSaved={vi.fn()} onDeleted={vi.fn()} />,
        );
        expect(screen.getByText(m.settings_auto_leveling())).toBeTruthy();
        expect(screen.getByText(m.settings_vibration())).toBeTruthy();
        expect(screen.getByText(m.settings_flow_calibration())).toBeTruthy();
    });

    it('hides the options the printer does not support and keeps their stored values', async () => {
        const live = { features: { auto_leveling_support: true, vibration_compensation_support: false } };
        await renderWithProviders(
            <PrinterSettingsForm printer={printerWith(live)} onSaved={vi.fn()} onDeleted={vi.fn()} />,
        );
        expect(screen.getByText(m.settings_auto_leveling())).toBeTruthy();
        expect(screen.queryByText(m.settings_vibration())).toBeNull();
        expect(screen.queryByText(m.settings_flow_calibration())).toBeNull();
        await userEvent.click(switchAfter(m.settings_auto_leveling()));
        await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
        await waitFor(() => expect(mocks.printerUpdate).toHaveBeenCalledOnce());
        expect(mocks.printerUpdate.mock.calls[0][1].settings).toMatchObject({
            autoLeveling: false,
            vibrationCompensation: false,
            flowCalibration: true,
        });
    });
});
