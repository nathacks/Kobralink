import type { PowerState, PrinterSettings } from '@kobralink/shared';
import { Injectable } from '@nestjs/common';
import { fetchWithTimeout } from '../common/fetch';
import { m } from '../i18n/locale';
import { HaApiService } from './ha-api.service';

type PowerSettings = Pick<PrinterSettings, 'plugSwitch' | 'powerOnUrl' | 'powerOffUrl' | 'powerStatusUrl'>;

@Injectable()
export class PowerService {
    constructor(private readonly ha: HaApiService) {}

    private usesHa(s: PowerSettings): boolean {
        return Boolean(s.plugSwitch) && this.ha.configured();
    }

    configured(s: PowerSettings): boolean {
        return this.usesHa(s) || Boolean(s.powerOnUrl || s.powerOffUrl);
    }

    async set(s: PowerSettings, action: 'on' | 'off'): Promise<void> {
        if (this.usesHa(s)) {
            await this.ha.setSwitch(s.plugSwitch, action === 'on').catch(() => {
                throw new Error(m.api_plug_unreachable());
            });
            return;
        }
        const url = action === 'on' ? s.powerOnUrl : s.powerOffUrl;
        if (!url) throw new Error(m.api_no_plug());
        const ok = await fetchWithTimeout(url)
            .then((r) => r.ok)
            .catch(() => false);
        if (!ok) throw new Error(m.api_plug_unreachable());
    }

    async state(s: PowerSettings): Promise<PowerState> {
        if (this.usesHa(s)) {
            const on = await this.ha.switchState(s.plugSwitch).catch(() => {
                throw new Error(m.api_plug_unreachable());
            });
            return on === null ? 'unknown' : on ? 'on' : 'off';
        }
        if (!s.powerStatusUrl) return 'unknown';
        const text = await fetchWithTimeout(s.powerStatusUrl)
            .then((r) => r.text())
            .catch(() => {
                throw new Error(m.api_plug_unreachable());
            });
        return parsePowerText(text);
    }
}

export function parsePowerText(text: string): PowerState {
    try {
        const power = String((JSON.parse(text) as { POWER?: string }).POWER ?? '').toUpperCase();
        if (power === 'ON' || power === 'OFF') return power.toLowerCase() as PowerState;
    } catch {}
    const up = text.toUpperCase();
    if (up.includes('ON') && !up.includes('OFF')) return 'on';
    if (up.includes('OFF')) return 'off';
    return 'unknown';
}
