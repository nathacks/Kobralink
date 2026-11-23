import {
    type HaEnergySensorDto,
    type HaSwitchDto,
    type HaTestResultDto,
    type HomeAssistantApiSettings,
    isEnergyUnit,
    toKwh,
} from '@kobralink/shared';
import { Injectable } from '@nestjs/common';
import { m } from '../i18n/locale';
import { SettingsService } from '../settings/settings.service';

interface HaState {
    entity_id: string;
    state: string;
    attributes?: { unit_of_measurement?: string; friendly_name?: string; device_class?: string };
}

const TIMEOUT_MS = 5000;

@Injectable()
export class HaApiService {
    constructor(private readonly settings: SettingsService) {}

    private config(): HomeAssistantApiSettings {
        return this.settings.get().homeAssistant;
    }

    configured(): boolean {
        const c = this.config();
        return Boolean(c.url && c.token);
    }

    private get<T>(path: string, c: HomeAssistantApiSettings = this.config()): Promise<T> {
        return this.request<T>('GET', path, undefined, c);
    }

    private async request<T>(
        method: 'GET' | 'POST',
        path: string,
        body?: unknown,
        c: HomeAssistantApiSettings = this.config(),
    ): Promise<T> {
        if (!c.url || !c.token) throw new Error(m.api_ha_not_configured());
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`${c.url.replace(/\/+$/, '')}${path}`, {
                method,
                headers: {
                    authorization: `Bearer ${c.token}`,
                    accept: 'application/json',
                    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: ctrl.signal,
            });
            if (res.status === 401 || res.status === 403) throw new Error(m.api_ha_unauthorized());
            if (!res.ok) throw new Error(m.api_ha_http_error({ status: String(res.status) }));
            return (await res.json()) as T;
        } catch (e) {
            if ((e as Error).name === 'AbortError') throw new Error(m.api_ha_unreachable());
            if (e instanceof TypeError) throw new Error(m.api_ha_unreachable());
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    async test(c: HomeAssistantApiSettings): Promise<HaTestResultDto> {
        try {
            const res = await this.get<{ message?: string }>('/api/', c);
            return { ok: true, message: res.message ?? '' };
        } catch (e) {
            return { ok: false, message: (e as Error).message };
        }
    }

    async energySensors(): Promise<HaEnergySensorDto[]> {
        const states = await this.get<HaState[]>('/api/states');
        return states
            .filter(
                (s) =>
                    s.entity_id.startsWith('sensor.') &&
                    (s.attributes?.device_class === 'energy' || isEnergyUnit(s.attributes?.unit_of_measurement)),
            )
            .map((s) => ({
                entityId: s.entity_id,
                name: s.attributes?.friendly_name || s.entity_id,
                kwh: toKwh(s.state, s.attributes?.unit_of_measurement),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async switches(): Promise<HaSwitchDto[]> {
        const states = await this.get<HaState[]>('/api/states');
        return states
            .filter((s) => s.entity_id.startsWith('switch.'))
            .map((s) => ({
                entityId: s.entity_id,
                name: s.attributes?.friendly_name || s.entity_id,
                on: switchOn(s.state),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async switchState(entityId: string): Promise<boolean | null> {
        const s = await this.get<HaState>(`/api/states/${encodeURIComponent(entityId)}`);
        return switchOn(s.state);
    }

    async setSwitch(entityId: string, on: boolean): Promise<void> {
        await this.request('POST', `/api/services/switch/${on ? 'turn_on' : 'turn_off'}`, { entity_id: entityId });
    }

    async readKwh(entityId: string): Promise<number | null> {
        const s = await this.get<HaState>(`/api/states/${encodeURIComponent(entityId)}`);
        return toKwh(s.state, s.attributes?.unit_of_measurement);
    }
}

function switchOn(state: string): boolean | null {
    if (state === 'on') return true;
    if (state === 'off') return false;
    return null;
}
