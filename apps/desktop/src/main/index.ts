import path from 'node:path';
import { m } from '@kobralink/i18n';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import appIcon from '../../resources/icon.png?asset';
import { installLocale } from '../shared/locale';
import { apiAvailable, apiLogPath, LOCAL_PORT, startLocalApi, stopLocalApi, waitForApi } from './api-process';
import { setupTray, type TrayPrinterStatus, updateTray } from './tray';
import { checkForUpdates, setupUpdater } from './updater';

let win: BrowserWindow | null = null;

if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Kobralink Dev'));

function baseUrl(): string {
    if (process.env.KOBRALINK_URL) return process.env.KOBRALINK_URL.replace(/\/$/, '');
    return `http://localhost:${LOCAL_PORT}`;
}

function createWindow(): BrowserWindow {
    const w = new BrowserWindow({
        width: 1240,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        show: false,
        title: 'Kobralink',
        icon: appIcon,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        autoHideMenuBar: process.platform !== 'darwin',
        trafficLightPosition: { x: 14, y: 14 },
        backgroundColor: '#0f0f11',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            sandbox: false,
        },
    });
    w.once('ready-to-show', () => w.show());
    w.on('closed', () => {
        if (win === w) win = null;
    });
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
    const url = baseUrl();
    await loadLauncher(w, { status: 'starting' });

    if (!process.env.KOBRALINK_URL) {
        const alreadyUp = !app.isPackaged && (await waitForApi(url, 1500));
        if (!alreadyUp) {
            if (!apiAvailable()) {
                await loadLauncher(w, { status: 'error', message: m.desktop_api_build_missing() });
                return;
            }
            startLocalApi(LOCAL_PORT);
        }
    }
    const ok = await waitForApi(url, 40000);
    if (!ok) {
        await loadLauncher(w, { status: 'error', message: m.desktop_bridge_unreachable({ url, log: apiLogPath() }) });
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

function ensureWindow(): BrowserWindow {
    if (win && !win.isDestroyed()) return win;
    win = createWindow();
    void boot(win);
    return win;
}

ipcMain.on('tray:status', (_e, printers: TrayPrinterStatus[]) => {
    updateTray(Array.isArray(printers) ? printers : [], ensureWindow);
});

ipcMain.handle('app:retry', async () => {
    stopLocalApi();
    if (win) await boot(win);
});

app.whenReady().then(async () => {
    installLocale(app.getLocale());
    buildMenu();
    win = createWindow();
    if (!process.env.KOBRALINK_SHOT) {
        setupUpdater(() => win);
        setupTray(ensureWindow);
    }
    await boot(win);

    if (process.env.KOBRALINK_SHOT && win) {
        await new Promise((r) => setTimeout(r, 2500));

        const login = process.env.KOBRALINK_SHOT_LOGIN?.split('|');
        if (login && login.length >= 3) {
            await win.webContents.executeJavaScript(
                `fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(login[0])},password:${JSON.stringify(login[1])}})}).then(r=>r.status)`,
            );
            await win.loadURL(`${baseUrl()}${login[2]}`);
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
