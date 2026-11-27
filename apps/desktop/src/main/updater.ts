import fs from 'node:fs';
import path from 'node:path';
import { m } from '@kobralink/i18n';
import { app, type BrowserWindow, dialog, ipcMain, type MessageBoxOptions, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

const RELEASES_URL = 'https://github.com/nathacks/Kobralink/releases';

let checking = false;
let interactive = false;

export type UpdateStatus =
    | { state: 'downloading'; version: string; percent: number }
    | { state: 'downloaded'; version: string }
    | { state: 'error'; message: string };

function skipFile(): string {
    return path.join(app.getPath('userData'), 'updater.json');
}

function skippedVersion(): string | null {
    try {
        return JSON.parse(fs.readFileSync(skipFile(), 'utf8')).skippedVersion ?? null;
    } catch {
        return null;
    }
}

function skipVersion(version: string): void {
    fs.writeFileSync(skipFile(), JSON.stringify({ skippedVersion: version }));
}

function ask(win: BrowserWindow | null, options: MessageBoxOptions) {
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function install(): void {
    autoUpdater.quitAndInstall(true, true);
}

export function setupUpdater(getWindow: () => BrowserWindow | null): void {
    if (!app.isPackaged) return;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin';
    let version = '';

    const send = (status: UpdateStatus) => {
        const win = getWindow();
        if (!win || win.isDestroyed()) return;
        win.setProgressBar(status.state === 'downloading' ? status.percent / 100 : -1);
        win.webContents.send('update:status', status);
    };

    ipcMain.handle('update:install', () => install());

    autoUpdater.on('update-available', async (info) => {
        checking = false;
        version = info.version;
        if (!interactive && skippedVersion() === info.version) return;
        const win = getWindow();
        if (process.platform === 'darwin') {
            const { response } = await ask(win, {
                type: 'info',
                title: m.desktop_update_available_title(),
                message: m.desktop_update_manual_body({ version: info.version }),
                buttons: [m.desktop_update_open_github(), m.desktop_update_later(), m.desktop_update_skip()],
                defaultId: 0,
                cancelId: 1,
            });
            if (response === 0) void shell.openExternal(`${RELEASES_URL}/tag/v${info.version}`);
            if (response === 2) skipVersion(info.version);
            return;
        }
        const { response } = await ask(win, {
            type: 'info',
            title: m.desktop_update_available_title(),
            message: m.desktop_update_available_body({ version: info.version }),
            buttons: [m.desktop_update_download(), m.desktop_update_later(), m.desktop_update_skip()],
            defaultId: 0,
            cancelId: 1,
        });
        if (response === 2) skipVersion(info.version);
        if (response !== 0) return;
        interactive = true;
        send({ state: 'downloading', version: info.version, percent: 0 });
        autoUpdater.downloadUpdate().catch(() => {});
    });

    autoUpdater.on('download-progress', (p) => {
        send({ state: 'downloading', version, percent: Math.round(p.percent) });
    });

    autoUpdater.on('update-not-available', (info) => {
        checking = false;
        if (!interactive) return;
        interactive = false;
        void ask(getWindow(), {
            type: 'info',
            title: m.desktop_update_none_title(),
            message: m.desktop_update_none_body({ version: info.version }),
        });
    });

    autoUpdater.on('update-downloaded', async (info) => {
        interactive = false;
        send({ state: 'downloaded', version: info.version });
        const { response } = await ask(getWindow(), {
            type: 'info',
            title: m.desktop_update_ready_title(),
            message: m.desktop_update_ready_body({ version: info.version }),
            buttons: [m.desktop_update_restart(), m.desktop_update_later()],
            defaultId: 0,
            cancelId: 1,
        });
        if (response === 0) install();
    });

    autoUpdater.on('error', (err) => {
        checking = false;
        if (!interactive) return;
        interactive = false;
        send({ state: 'error', message: err.message });
        void ask(getWindow(), {
            type: 'error',
            title: m.desktop_update_error_title(),
            message: err.message,
        });
    });

    setTimeout(() => checkForUpdates(false), 15_000);
    setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);
}

export function checkForUpdates(userInitiated: boolean): void {
    if (!app.isPackaged || checking) return;
    checking = true;
    interactive = userInitiated;
    autoUpdater.checkForUpdates().catch(() => {
        checking = false;
    });
}
