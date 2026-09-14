import path from 'node:path';
import { m } from '@kobralink/i18n';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { installLocale } from '../shared/locale';
import { apiAvailable, startLocalApi, stopLocalApi, waitForApi } from './api-process';
import { type DesktopSettings, loadSettings, saveSettings } from './settings';
import { checkForUpdates, setupUpdater } from './updater';

let win: BrowserWindow | null = null;

function baseUrl(s: DesktopSettings): string {
    if (process.env.KOBRALINK_URL) return process.env.KOBRALINK_URL.replace(/\/$/, '');
    return s.mode === 'remote' ? s.remoteUrl.replace(/\/$/, '') : `http://localhost:${s.localPort}`;
}

function createWindow(): BrowserWindow {
    const w = new BrowserWindow({
        width: 1240,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        show: false,
        title: 'Kobralink',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 14, y: 14 },
        backgroundColor: '#0f0f11',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            sandbox: false,
        },
    });
    w.once('ready-to-show', () => w.show());
    w.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: 'deny' };
    });
    return w;
}

async function loadLauncher(w: BrowserWindow, query: Record<string, string> = {}): Promise<void> {
    if (process.env.ELECTRON_RENDERER_URL) {
        const u = new URL(process.env.ELECTRON_RENDERER_URL);
        for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
        await w.loadURL(u.toString());
    } else {
        await w.loadFile(path.join(__dirname, '../renderer/index.html'), { query });
    }
}

async function boot(w: BrowserWindow): Promise<void> {
    const settings = loadSettings();
    const url = baseUrl(settings);
    await loadLauncher(w, { status: 'starting', url });

    if (settings.mode === 'local' && !process.env.KOBRALINK_URL) {
        const alreadyUp = await waitForApi(url, 1500);
        if (!alreadyUp) {
            if (!apiAvailable()) {
                await loadLauncher(w, {
                    status: 'error',
                    url,
                    message: m.desktop_api_build_missing(),
                });
                return;
            }
            startLocalApi(settings.localPort);
        }
    }
    const ok = await waitForApi(url, 40000);
    if (!ok) {
        await loadLauncher(w, { status: 'error', url, message: m.desktop_bridge_unreachable({ url }) });
        return;
    }
    await w.loadURL(url);
}

function buildMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                {
                    label: m.desktop_menu_check_updates(),
                    enabled: app.isPackaged,
                    click: () => checkForUpdates(true),
                },
                { type: 'separator' },
                {
                    label: m.desktop_menu_change_bridge(),
                    accelerator: 'Cmd+,',
                    click: () => {
                        if (win) void loadLauncher(win, { status: 'settings', ...settingsQuery() });
                    },
                },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
        { role: 'editMenu' },
        {
            label: m.desktop_menu_view(),
            submenu: [
                { role: 'reload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function settingsQuery(): Record<string, string> {
    const s = loadSettings();
    return { mode: s.mode, remoteUrl: s.remoteUrl, localPort: String(s.localPort) };
}

ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:save', async (_e, next: Partial<DesktopSettings>) => {
    const saved = saveSettings(next);
    stopLocalApi();
    if (win) await boot(win);
    return saved;
});
ipcMain.handle('app:retry', async () => {
    if (win) await boot(win);
});

app.whenReady().then(async () => {
    installLocale(app.getLocale());
    buildMenu();
    win = createWindow();
    if (!process.env.KOBRALINK_SHOT) setupUpdater(() => win);
    await boot(win);

    if (process.env.KOBRALINK_SHOT && win) {
        await new Promise((r) => setTimeout(r, 2500));

        const login = process.env.KOBRALINK_SHOT_LOGIN?.split('|');
        if (login && login.length >= 3) {
            await win.webContents.executeJavaScript(
                `fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(login[0])},password:${JSON.stringify(login[1])}})}).then(r=>r.status)`,
            );
            await win.loadURL(`${baseUrl(loadSettings())}${login[2]}`);
            await new Promise((r) => setTimeout(r, 2500));
        }
        if (process.env.KOBRALINK_SHOT_JS) {
            await win.webContents.executeJavaScript(process.env.KOBRALINK_SHOT_JS);
            await new Promise((r) => setTimeout(r, 3000));
        }
        const img = await win.webContents.capturePage();
        await import('node:fs/promises').then((fs) => fs.writeFile(process.env.KOBRALINK_SHOT as string, img.toPNG()));
        app.quit();
        return;
    }
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            win = createWindow();
            void boot(win);
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => stopLocalApi());
