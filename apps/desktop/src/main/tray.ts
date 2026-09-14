import { readFileSync } from 'node:fs';
import { m } from '@kobralink/i18n';
import { app, type BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import trayIcon from '../../resources/tray.png?asset';
import trayTemplate2x from '../../resources/trayTemplate@2x.png?asset';
import trayTemplate1x from '../../resources/trayTemplate.png?asset';

export interface TrayPrinterStatus {
    id: string;
    name: string;
    connected: boolean;
    printState: string;
    progress: number;
    remainTimeSec: number;
    filename: string;
}

let tray: Tray | null = null;
let printers: TrayPrinterStatus[] = [];

function icon(): Electron.NativeImage {
    if (process.platform !== 'darwin') return nativeImage.createFromPath(trayIcon);
    const img = nativeImage.createEmpty();
    img.addRepresentation({ scaleFactor: 1, buffer: readFileSync(trayTemplate1x) });
    img.addRepresentation({ scaleFactor: 2, buffer: readFileSync(trayTemplate2x) });
    img.setTemplateImage(true);
    return img;
}

function fmt(sec: number): string {
    if (!sec || sec < 0) return '—';
    const h = Math.floor(sec / 3600);
    const min = Math.floor((sec % 3600) / 60);
    return h ? `${h} h ${min.toString().padStart(2, '0')}` : `${min} min`;
}

function render(getWindow: () => BrowserWindow | null): void {
    if (!tray) return;
    const active = printers.filter((p) => p.printState === 'printing' || p.printState === 'paused');
    const title =
        active.length === 1
            ? ` ${Math.round(active[0].progress * 100)}%`
            : active.length > 1
              ? ` ${active.length}×`
              : '';
    if (process.platform === 'darwin') tray.setTitle(title);
    tray.setToolTip(
        active.length ? active.map((p) => `${p.name}: ${Math.round(p.progress * 100)}%`).join('\n') : 'Kobralink',
    );
    const items: Electron.MenuItemConstructorOptions[] = printers.length
        ? printers.map((p) => {
              const printing = p.printState === 'printing' || p.printState === 'paused';
              const label = !p.connected
                  ? `${p.name} — ${m.tray_offline()}`
                  : printing
                    ? `${p.name} — ${Math.round(p.progress * 100)}% · ${fmt(p.remainTimeSec)}`
                    : `${p.name} — ${m.tray_idle()}`;
              return {
                  label,
                  sublabel: printing ? p.filename : undefined,
                  click: () => {
                      const win = getWindow();
                      if (!win) return;
                      win.show();
                      win.focus();
                      void win.webContents.executeJavaScript(
                          `window.dispatchEvent(new CustomEvent('kobralink:navigate',{detail:${JSON.stringify(`/printers/${p.id}`)}}))`,
                      );
                  },
              };
          })
        : [{ label: m.tray_no_printer(), enabled: false }];
    tray.setContextMenu(
        Menu.buildFromTemplate([
            ...items,
            { type: 'separator' },
            {
                label: m.tray_open(),
                click: () => {
                    const win = getWindow();
                    if (win) {
                        win.show();
                        win.focus();
                    }
                },
            },
            { label: m.tray_quit(), click: () => app.quit() },
        ]),
    );
}

export function setupTray(getWindow: () => BrowserWindow | null): void {
    if (tray) return;
    tray = new Tray(icon());
    render(getWindow);
    tray.on('click', () => {
        const win = getWindow();
        if (!win) return;
        if (win.isVisible() && win.isFocused()) win.hide();
        else {
            win.show();
            win.focus();
        }
    });
}

export function updateTray(next: TrayPrinterStatus[], getWindow: () => BrowserWindow | null): void {
    printers = next;
    render(getWindow);
}
