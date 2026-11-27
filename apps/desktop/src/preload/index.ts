import { contextBridge, ipcRenderer } from 'electron';
import type { UpdateStatus } from '../main/updater';

export interface KobralinkDesktopApi {
    platform: NodeJS.Platform;
    retry(): Promise<void>;
    showLog(): Promise<void>;
    reportIssue(): Promise<void>;
    setTrayStatus(printers: unknown[]): void;
    onUpdateStatus(cb: (status: UpdateStatus) => void): () => void;
    installUpdate(): Promise<void>;
}

const api: KobralinkDesktopApi = {
    platform: process.platform,
    retry: () => ipcRenderer.invoke('app:retry'),
    showLog: () => ipcRenderer.invoke('app:show-log'),
    reportIssue: () => ipcRenderer.invoke('app:report-issue'),
    setTrayStatus: (printers) => ipcRenderer.send('tray:status', printers),
    onUpdateStatus: (cb) => {
        const listener = (_e: Electron.IpcRendererEvent, status: UpdateStatus) => cb(status);
        ipcRenderer.on('update:status', listener);
        return () => ipcRenderer.off('update:status', listener);
    },
    installUpdate: () => ipcRenderer.invoke('update:install'),
};

contextBridge.exposeInMainWorld('kobralinkDesktop', api);
