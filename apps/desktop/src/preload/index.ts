import { contextBridge, ipcRenderer } from 'electron';

export interface KobralinkDesktopApi {
    retry(): Promise<void>;
    setTrayStatus(printers: unknown[]): void;
}

const api: KobralinkDesktopApi = {
    retry: () => ipcRenderer.invoke('app:retry'),
    setTrayStatus: (printers) => ipcRenderer.send('tray:status', printers),
};

contextBridge.exposeInMainWorld('kobralinkDesktop', api);
