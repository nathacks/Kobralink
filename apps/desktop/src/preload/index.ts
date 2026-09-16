import { contextBridge, ipcRenderer } from 'electron';

export interface KobralinkDesktopApi {
    platform: NodeJS.Platform;
    retry(): Promise<void>;
    showLog(): Promise<void>;
    reportIssue(): Promise<void>;
    setTrayStatus(printers: unknown[]): void;
}

const api: KobralinkDesktopApi = {
    platform: process.platform,
    retry: () => ipcRenderer.invoke('app:retry'),
    showLog: () => ipcRenderer.invoke('app:show-log'),
    reportIssue: () => ipcRenderer.invoke('app:report-issue'),
    setTrayStatus: (printers) => ipcRenderer.send('tray:status', printers),
};

contextBridge.exposeInMainWorld('kobralinkDesktop', api);
