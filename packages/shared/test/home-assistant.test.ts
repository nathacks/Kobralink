import { describe, expect, it } from 'bun:test';
import { jobCost } from '../src/cost';
import {
    homeAssistantApiSettingsSchema,
    homeAssistantTestSchema,
    isEnergyUnit,
    measuredKwh,
    toKwh,
} from '../src/home-assistant';
import { printerSettingsSchema } from '../src/printer';
import { appSettingsSchema } from '../src/settings';

describe('toKwh', () => {
    it('converts Wh, kWh and MWh readings and ignores anything else', () => {
        expect(toKwh('1234.5', 'kWh')).toBe(1234.5);
        expect(toKwh('1500', 'Wh')).toBe(1.5);
        expect(toKwh(2, 'MWh')).toBe(2000);
        expect(toKwh('12', 'W')).toBeNull();
        expect(toKwh('unavailable', 'kWh')).toBeNull();
        expect(toKwh(null, 'kWh')).toBeNull();
        expect(isEnergyUnit('kwh')).toBe(true);
        expect(isEnergyUnit('°C')).toBe(false);
    });
});

describe('measuredKwh', () => {
    it('subtracts the start reading and rejects a meter that went backwards', () => {
        expect(measuredKwh(100.1234, 100.5678)).toBe(0.444);
        expect(measuredKwh(100, 99)).toBeNull();
        expect(measuredKwh(null, 5)).toBeNull();
        expect(measuredKwh(5, null)).toBeNull();
    });
});

describe('Home Assistant settings', () => {
    it('start empty and need a URL and a token to test', () => {
        expect(appSettingsSchema.parse({}).homeAssistant).toEqual({ url: '', token: '' });
        expect(homeAssistantApiSettingsSchema.safeParse({ url: 'not a url' }).success).toBe(false);
        expect(homeAssistantTestSchema.safeParse({ url: 'http://ha.local:8123', token: '' }).success).toBe(false);
        expect(homeAssistantTestSchema.parse({ url: 'http://ha.local:8123', token: ' abc ' }).token).toBe('abc');
    });

    it('accept only a sensor entity for the printer energy', () => {
        expect(printerSettingsSchema.parse({}).energySensor).toBe('');
        expect(printerSettingsSchema.parse({ energySensor: 'sensor.kobra_plug_energy' }).energySensor).toBe(
            'sensor.kobra_plug_energy',
        );
        expect(printerSettingsSchema.safeParse({ energySensor: 'switch.kobra_plug' }).success).toBe(false);
    });
});

describe('jobCost with measured energy', () => {
    const costs = { energyPricePerKwh: 0.8, printerPowerW: 200 };

    it('prices the measured kWh instead of the average draw', () => {
        expect(jobCost(3600, 0, costs, {}, 0.5).energy).toBe(0.4);
        expect(jobCost(3600, 0, costs, {}).energy).toBe(0.16);
        expect(jobCost(3600, 0, costs, {}, null).energy).toBe(0.16);
    });
});
