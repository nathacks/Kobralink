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
const spinner = document.getElementById('spinner') as HTMLDivElement;
const errorActions = document.getElementById('error-actions') as HTMLDivElement;
const errorHelp = document.getElementById('error-help') as HTMLDivElement;

if (status === 'error') {
    message.textContent = params.get('message') ?? m.desktop_error();
    spinner.hidden = true;
    errorActions.hidden = false;
    errorHelp.hidden = false;
} else {
    message.textContent = m.desktop_starting_short();
}

document.getElementById('retry')?.addEventListener('click', () => {
    message.textContent = m.desktop_starting_short();
    errorActions.hidden = true;
    errorHelp.hidden = true;
    spinner.hidden = false;
    void window.kobralinkDesktop.retry();
});

document.getElementById('show-log')?.addEventListener('click', () => void window.kobralinkDesktop.showLog());
document.getElementById('report-issue')?.addEventListener('click', () => void window.kobralinkDesktop.reportIssue());
