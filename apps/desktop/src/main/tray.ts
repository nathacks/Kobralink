import { m } from '@kobralink/i18n';
import { app, type BrowserWindow, Menu, nativeImage, Tray } from 'electron';

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

function icon() {
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4, 0);
    const set = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const i = (y * size + x) * 4;
        canvas[i] = 0;
        canvas[i + 1] = 0;
        canvas[i + 2] = 0;
        canvas[i + 3] = 255;
    };
    for (let y = 3; y <= 12; y++) {
        set(2, y);
        set(13, y);
    }
    for (let x = 2; x <= 13; x++) {
        set(x, 3);
        set(x, 12);
    }
    for (let x = 5; x <= 10; x++) set(x, 9);
    for (let y = 6; y <= 9; y++) set(5, y);
    set(6, 6);
    set(7, 6);
    set(8, 6);
    set(9, 7);
    set(10, 8);
    const img = nativeImage.createFromBitmap(canvas, { width: size, height: size, scaleFactor: 1 });
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
