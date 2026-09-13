import { contextBridge, ipcRenderer } from 'electron';

export interface KobralinkDesktopApi {
    getSettings(): Promise<{ mode: 'local' | 'remote'; remoteUrl: string; localPort: number }>;
    saveSettings(next: { mode?: 'local' | 'remote'; remoteUrl?: string; localPort?: number }): Promise<unknown>;
    retry(): Promise<void>;
}

const api: KobralinkDesktopApi = {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (next) => ipcRenderer.invoke('settings:save', next),
    retry: () => ipcRenderer.invoke('app:retry'),
};

contextBridge.exposeInMainWorld('kobralinkDesktop', api);
