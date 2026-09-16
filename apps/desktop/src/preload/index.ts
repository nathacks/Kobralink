import { contextBridge, ipcRenderer } from 'electron';

export interface KobralinkDesktopApi {
    platform: NodeJS.Platform;
    retry(): Promise<void>;
    setTrayStatus(printers: unknown[]): void;
}

const api: KobralinkDesktopApi = {
    platform: process.platform,
    retry: () => ipcRenderer.invoke('app:retry'),
    setTrayStatus: (printers) => ipcRenderer.send('tray:status', printers),
};

contextBridge.exposeInMainWorld('kobralinkDesktop', api);
