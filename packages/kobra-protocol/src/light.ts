import { CAMERA_LIGHT_TYPE, type KobraLight, type KobraLightData } from './types';

export interface LightReading {
    on: boolean;
    brightness: number;
}

export function readLight(data: KobraLightData | null | undefined, type = CAMERA_LIGHT_TYPE): LightReading | null {
    if (!data || typeof data !== 'object') return null;
    let light: KobraLight | undefined;
    if (Array.isArray(data.lights)) light = data.lights.find((l) => l && typeof l === 'object' && l.type === type);
    else if (data.type === undefined || data.type === type) light = data;
    if (!light || light.status === undefined || light.status === null) return null;
    return { on: Number(light.status) === 1, brightness: Number(light.brightness ?? 0) || 0 };
}
