import { type AppSettings, appSettingsSchema } from '@kobralink/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '@/lib/i18n';
import { findSetting } from '@/lib/reveal-setting';
import { renderWithProviders, testQueryClient } from '@/test/render';
import { DetectionCard } from './detection-card';
import { GeneralSettingsPage } from './general-settings-page';
import { HaApiCard } from './ha-api-card';
import { HaMqttCard } from './ha-mqtt-card';
import { NotificationsCard } from './notifications-card';
import { searchSettings, settingHits } from './settings-index';
import { SettingsSearch } from './settings-search';
import { SpoolmanCard } from './spoolman-card';

vi.mock('@/lib/api', async () => {
    const { appSettingsSchema: schema } = await import('@kobralink/shared');
    const group = (value: unknown) => new Proxy({}, { get: () => vi.fn().mockResolvedValue(value) });
    const settings = schema.parse({ locale: 'en' });
    return { api: new Proxy({}, { get: (_, name) => group(name === 'settings' ? settings : []) }) };
});

const stored: AppSettings = appSettingsSchema.parse({ locale: 'en' });
const printers = [
    { id: 'p1', name: 'Atelier' },
    { id: 'p2', name: 'Garage' },
];
const hits = () => settingHits(stored, printers, true);

function client() {
    const qc = testQueryClient();
    qc.setQueryData(['settings'], stored);
    qc.setQueryData(['session'], { user: { id: 'u1', email: 'a@b.c', name: 'A', role: 'admin' } });
    return qc;
}

const sources = import.meta.glob<string>(
    [
        './*-card.tsx',
        '../printer/settings-form.tsx',
        '../printer/profile-fields.tsx',
        '../printer/plug-fields.tsx',
        '!./users-card.tsx',
        '!./spools-card.tsx',
    ],
    { query: '?raw', import: 'default', eager: true },
);

describe('settings index', () => {
    it('lists every labelled setting of the settings cards', () => {
        const withPlug = { ...stored, homeAssistant: { url: 'http://ha', token: 'x' } };
        const labels = new Set(settingHits(withPlug, printers, true).map((h) => h.label));
        const messages = m as unknown as Record<string, (inputs?: object) => string>;
        const pattern =
            /(?:(?<!-)label=\{|title=\{|<CardTitle>\s*\{|<Label[^>]*>\s*\{|num\('\w+', |text\('\w+', )m\.(\w+)\(/g;
        const keys = Object.values(sources).flatMap((src) => [...src.matchAll(pattern)].map((x) => x[1]));
        expect(keys.length).toBeGreaterThan(50);
        const missing = keys.filter((key) => {
            const label = messages[key]({});
            return !labels.has(label);
        });
        expect(missing).toEqual([]);
    });

    it('has unique ids and lists printer settings once per printer', () => {
        const ids = hits().map((h) => h.id);
        expect(new Set(ids).size).toBe(ids.length);
        const found = searchSettings(hits(), m.settings_timelapse_fps());
        expect(found.map((h) => h.printerId)).toEqual(['p1', 'p2']);
        expect(searchSettings(hits(), `${m.settings_timelapse_fps()} garage`).map((h) => h.printerId)).toEqual(['p2']);
    });

    it('ignores case and accents and ranks labels before hints', () => {
        const base = { id: 'x', to: '/filament' as const, section: 'S', card: 'C' };
        const list = [
            { ...base, id: 'hint', label: 'Autre', hint: 'mesure d’énergie' },
            { ...base, id: 'label', label: "Compteur d'Énergie", hint: '' },
        ];
        expect(searchSettings(list, "d'energie").map((h) => h.id)).toEqual(['label', 'hint']);
        expect(searchSettings(list, '  ')).toEqual([]);
    });

    it('hides what the user cannot reach', () => {
        expect(settingHits(stored, [], false).some((h) => h.to === '/settings/users')).toBe(false);
        expect(hits().some((h) => h.label === m.plug_switch())).toBe(false);
        expect(hits().some((h) => h.label === m.spools_title())).toBe(true);
        expect(hits().some((h) => h.label === m.spoolman_spools_title())).toBe(false);
    });

    it.each([
        ['/settings/general', <GeneralSettingsPage key="g" />],
        ['/settings/notifications', <NotificationsCard key="n" settings={stored} />],
        ['/settings/detection', <DetectionCard key="d" settings={stored} />],
        [
            '/settings/integrations',
            <div key="i">
                <SpoolmanCard settings={stored} />
                <HaMqttCard settings={stored} />
                <HaApiCard settings={stored} />
            </div>,
        ],
    ])('points every entry of %s to an element of the page', async (to, ui) => {
        await renderWithProviders(ui, { queryClient: client() });
        const unresolved = hits()
            .filter((h) => h.to === to && h.card !== undefined)
            .filter((h) => !findSetting(h.card ?? '', h.label)?.exact);
        expect(unresolved).toEqual([]);
    });
});

describe('SettingsSearch', () => {
    const scroll = vi.fn();
    const animate = vi.fn();

    beforeEach(() => {
        scroll.mockReset();
        animate.mockReset();
        HTMLElement.prototype.scrollIntoView = scroll;
        HTMLElement.prototype.animate = animate;
    });

    it('navigates to the setting picked with the keyboard, scrolls to it and highlights it', async () => {
        const { router } = await renderWithProviders(
            <>
                <SettingsSearch />
                <GeneralSettingsPage />
            </>,
            { queryClient: client() },
        );
        const input = screen.getByRole('combobox', { name: m.settings_search() });
        await userEvent.type(input, m.settings_energy_price());
        expect(screen.getAllByRole('option')).toHaveLength(1);
        await userEvent.keyboard('{Enter}');
        expect(router.state.location.pathname).toBe('/settings/general');
        await waitFor(() => expect(animate).toHaveBeenCalledOnce());
        const row = screen.getByText(m.settings_energy_price()).closest('[data-setting]');
        expect(animate.mock.contexts[0]).toBe(row);
        expect(scroll.mock.contexts).toContain(row);
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('says when nothing matches and closes with escape', async () => {
        await renderWithProviders(<SettingsSearch />, { queryClient: client() });
        await userEvent.type(screen.getByRole('combobox'), 'zzzz');
        expect(screen.getByText(m.settings_search_empty())).toBeTruthy();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByText(m.settings_search_empty())).toBeNull();
    });
});
