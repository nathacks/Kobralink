import { m } from '@kobralink/i18n';
import type { KobralinkDesktopApi } from '../preload/index';
import { installLocale } from '../shared/locale';

declare global {
    interface Window {
        kobralinkDesktop: KobralinkDesktopApi;
    }
}

installLocale(navigator.language);
document.documentElement.lang = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr';
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as keyof typeof m;
    const fn = m[key] as (() => string) | undefined;
    if (fn) el.textContent = fn();
}

const params = new URLSearchParams(window.location.search);
const status = params.get('status') ?? 'starting';
const message = document.getElementById('message') as HTMLParagraphElement;
const form = document.getElementById('settings') as HTMLFormElement;
const errorActions = document.getElementById('error-actions') as HTMLDivElement;

async function showSettings(): Promise<void> {
    const s = await window.kobralinkDesktop.getSettings();
    message.textContent = m.desktop_where_bridge();
    (form.querySelector(`input[name=mode][value=${s.mode}]`) as HTMLInputElement).checked = true;
    (document.getElementById('localPort') as HTMLInputElement).value = String(s.localPort);
    (document.getElementById('remoteUrl') as HTMLInputElement).value = s.remoteUrl;
    form.hidden = false;
    errorActions.hidden = true;
}

if (status === 'settings') {
    void showSettings();
} else if (status === 'error') {
    message.textContent = params.get('message') ?? m.desktop_error();
    errorActions.hidden = false;
} else {
    message.textContent = m.desktop_starting({ url: params.get('url') ?? '' });
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mode = (form.querySelector('input[name=mode]:checked') as HTMLInputElement).value as 'local' | 'remote';
    const localPort = Number((document.getElementById('localPort') as HTMLInputElement).value) || 7100;
    const remoteUrl = (document.getElementById('remoteUrl') as HTMLInputElement).value.trim();
    message.textContent = m.desktop_connecting();
    form.hidden = true;
    void window.kobralinkDesktop.saveSettings({ mode, localPort, remoteUrl });
});

document.getElementById('retry')?.addEventListener('click', () => void window.kobralinkDesktop.retry());
document.getElementById('open-settings')?.addEventListener('click', () => void showSettings());
