import { m } from '@kobralink/i18n';
import { app, type BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import { autoUpdater } from 'electron-updater';

let checking = false;
let interactive = false;

function ask(win: BrowserWindow | null, options: MessageBoxOptions) {
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

export function setupUpdater(getWindow: () => BrowserWindow | null): void {
    if (!app.isPackaged) return;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', async (info) => {
        checking = false;
        const win = getWindow();
        const { response } = await ask(win, {
            type: 'info',
            title: m.desktop_update_available_title(),
            message: m.desktop_update_available_body({ version: info.version }),
            buttons: [m.desktop_update_download(), m.desktop_update_later()],
            defaultId: 0,
            cancelId: 1,
        });
        if (response === 0) void autoUpdater.downloadUpdate();
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
        const { response } = await ask(getWindow(), {
            type: 'info',
            title: m.desktop_update_ready_title(),
            message: m.desktop_update_ready_body({ version: info.version }),
            buttons: [m.desktop_update_restart(), m.desktop_update_later()],
            defaultId: 0,
            cancelId: 1,
        });
        if (response === 0) autoUpdater.quitAndInstall();
    });

    autoUpdater.on('error', (err) => {
        checking = false;
        if (!interactive) return;
        interactive = false;
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
