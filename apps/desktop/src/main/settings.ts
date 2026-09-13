import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface DesktopSettings {
    mode: 'local' | 'remote';
    remoteUrl: string;
    localPort: number;
}

const DEFAULTS: DesktopSettings = {
    mode: 'local',
    remoteUrl: 'http://localhost:7100',
    localPort: 7100,
};

function file(): string {
    return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): DesktopSettings {
    try {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
    } catch {
        return { ...DEFAULTS };
    }
}

export function saveSettings(next: Partial<DesktopSettings>): DesktopSettings {
    const merged = { ...loadSettings(), ...next };
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(merged, null, 2));
    return merged;
}
