import { describe, expect, it } from 'bun:test';
import { aceDryPresetSchema, appSettingsSchema, DEFAULT_DRY_PRESETS, updateAppSettingsSchema } from '../src/settings';

describe('updateAppSettingsSchema', () => {
    it('keeps only the keys present in the body', () => {
        const parsed = updateAppSettingsSchema.parse({ spoolmanUrl: 'http://spoolman:8000' });
        expect(parsed).toEqual({ spoolmanUrl: 'http://spoolman:8000' });
    });

    it('does not fill omitted sections with defaults', () => {
        const parsed = updateAppSettingsSchema.parse({ notifications: { discordUrl: 'https://discord.test/hook' } });
        expect(Object.keys(parsed)).toEqual(['notifications']);
        expect(parsed.locale).toBeUndefined();
        expect(parsed.spoolmanUrl).toBeUndefined();
        expect(parsed.failureDetection).toBeUndefined();
    });

    it('accepts an empty body', () => {
        expect(updateAppSettingsSchema.parse({})).toEqual({});
    });

    it('still validates the values that are sent', () => {
        expect(updateAppSettingsSchema.safeParse({ locale: 'xx' }).success).toBe(false);
        expect(updateAppSettingsSchema.safeParse({ spoolmanSyncRateSec: -1 }).success).toBe(false);
    });

    it('preserves earlier settings when merged with a single card save', () => {
        const stored = appSettingsSchema.parse({ locale: 'en', currency: 'BRL', spoolmanUrl: 'http://spoolman:8000' });
        const patch = updateAppSettingsSchema.parse({ failureDetection: { enabled: true } });
        const next = appSettingsSchema.parse({ ...stored, ...patch });
        expect(next.locale).toBe('en');
        expect(next.currency).toBe('BRL');
        expect(next.spoolmanUrl).toBe('http://spoolman:8000');
        expect(next.failureDetection.enabled).toBe(true);
    });
});

describe('failureDetection.light', () => {
    it('turns the camera light on during detection by default, settings saved before it included', () => {
        expect(appSettingsSchema.parse({}).failureDetection.light).toBe(true);
        const saved = appSettingsSchema.parse({ failureDetection: { enabled: true, action: 'pause' } });
        expect(saved.failureDetection).toMatchObject({ enabled: true, action: 'pause', light: true });
    });

    it('keeps the light off when the user turned it off', () => {
        expect(appSettingsSchema.parse({ failureDetection: { light: false } }).failureDetection.light).toBe(false);
    });
});

describe('publicUrl', () => {
    it('is empty until the address of FarolPrint is set', () => {
        expect(appSettingsSchema.parse({}).publicUrl).toBe('');
    });

    it('accepts a URL and rejects anything else', () => {
        expect(appSettingsSchema.parse({ publicUrl: 'http://farol.local:7100' }).publicUrl).toBe(
            'http://farol.local:7100',
        );
        expect(appSettingsSchema.safeParse({ publicUrl: 'farol.local' }).success).toBe(false);
        expect(updateAppSettingsSchema.parse({ publicUrl: '' })).toEqual({ publicUrl: '' });
    });
});

describe('DEFAULT_DRY_PRESETS', () => {
    it('are the presets of the official Anycubic drying dialog', () => {
        expect(DEFAULT_DRY_PRESETS).toEqual([
            { name: 'PLA', targetTemp: 45, duration: 240 },
            { name: 'PLA+', targetTemp: 45, duration: 240 },
            { name: 'PETG', targetTemp: 50, duration: 240 },
            { name: 'TPU', targetTemp: 55, duration: 240 },
            { name: 'ABS / ASA', targetTemp: 55, duration: 480 },
            { name: 'PA / PC', targetTemp: 55, duration: 720 },
        ]);
    });

    it('never ask an ACE for more than 55 °C and stay valid presets', () => {
        for (const preset of DEFAULT_DRY_PRESETS) {
            expect(preset.targetTemp).toBeLessThanOrEqual(55);
            expect(aceDryPresetSchema.safeParse(preset).success).toBe(true);
        }
    });

    it('are what a fresh install starts with', () => {
        expect(appSettingsSchema.parse({}).aceDryPresets).toEqual(DEFAULT_DRY_PRESETS);
    });
});
