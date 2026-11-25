import { defineI18n } from 'fumadocs-core/i18n';

export const i18n = defineI18n({
    defaultLanguage: 'en',
    languages: ['fr', 'en', 'de', 'es', 'it', 'zh-cn', 'pt-br'],
    parser: 'dot',
});

export type Lang = (typeof i18n.languages)[number];

export const htmlLang: Record<Lang, string> = {
    fr: 'fr',
    en: 'en',
    de: 'de',
    es: 'es',
    it: 'it',
    'zh-cn': 'zh-CN',
    'pt-br': 'pt-BR',
};

export const languageNames: Record<Lang, string> = {
    fr: 'Français',
    en: 'English',
    de: 'Deutsch',
    es: 'Español',
    it: 'Italiano',
    'zh-cn': '简体中文',
    'pt-br': 'Português (Brasil)',
};

export function isLang(value: string | undefined): value is Lang {
    return i18n.languages.includes(value as Lang);
}

export function toLang(value: string | undefined): Lang {
    return isLang(value) ? value : i18n.defaultLanguage;
}

export function pickLang(preferred: readonly string[]): Lang {
    for (const tag of preferred) {
        const lower = tag.toLowerCase();
        if (isLang(lower)) return lower;
        if (lower.startsWith('zh')) return 'zh-cn';
        if (lower.startsWith('pt')) return 'pt-br';
        const base = lower.split('-')[0];
        if (isLang(base)) return base;
    }
    return i18n.defaultLanguage;
}

interface SiteText {
    description: string;
    tagline: string;
    readDocs: string;
    install: string;
    screenshotAlt: string;
    notFoundTitle: string;
    notFoundBody: string;
    backToDocs: string;
}

export const siteText: Record<Lang, SiteText> = {
    en: {
        description: 'Moonraker bridge and web dashboard for Anycubic Kobra X and Kobra 4 printers.',
        tagline:
            'Turn an Anycubic Kobra X or Kobra 4 into a Moonraker-compatible printer. No Klipper, no Raspberry Pi, no firmware change.',
        readDocs: 'Read the documentation',
        install: 'Install',
        screenshotAlt: 'The Kobralink dashboard',
        notFoundTitle: 'Page not found',
        notFoundBody: 'This page does not exist or has moved.',
        backToDocs: 'Back to the documentation',
    },
    fr: {
        description: 'Bridge Moonraker et tableau de bord web pour les imprimantes Anycubic Kobra X et Kobra 4.',
        tagline:
            'Transformez une Anycubic Kobra X ou Kobra 4 en imprimante compatible Moonraker. Sans Klipper, sans Raspberry Pi, sans changer le firmware.',
        readDocs: 'Lire la documentation',
        install: 'Installer',
        screenshotAlt: 'Le tableau de bord Kobralink',
        notFoundTitle: 'Page introuvable',
        notFoundBody: "Cette page n'existe pas ou a été déplacée.",
        backToDocs: 'Retour à la documentation',
    },
    de: {
        description: 'Moonraker-Bridge und Web-Dashboard für Anycubic Kobra X und Kobra 4.',
        tagline:
            'Macht einen Anycubic Kobra X oder Kobra 4 zu einem Moonraker-kompatiblen Drucker. Ohne Klipper, ohne Raspberry Pi, ohne Firmware-Änderung.',
        readDocs: 'Dokumentation lesen',
        install: 'Installieren',
        screenshotAlt: 'Das Kobralink-Dashboard',
        notFoundTitle: 'Seite nicht gefunden',
        notFoundBody: 'Diese Seite existiert nicht oder wurde verschoben.',
        backToDocs: 'Zurück zur Dokumentation',
    },
    es: {
        description: 'Puente Moonraker y panel web para las impresoras Anycubic Kobra X y Kobra 4.',
        tagline:
            'Convierte una Anycubic Kobra X o Kobra 4 en una impresora compatible con Moonraker. Sin Klipper, sin Raspberry Pi, sin cambiar el firmware.',
        readDocs: 'Leer la documentación',
        install: 'Instalar',
        screenshotAlt: 'El panel de Kobralink',
        notFoundTitle: 'Página no encontrada',
        notFoundBody: 'Esta página no existe o se ha movido.',
        backToDocs: 'Volver a la documentación',
    },
    it: {
        description: 'Bridge Moonraker e dashboard web per le stampanti Anycubic Kobra X e Kobra 4.',
        tagline:
            'Trasforma una Anycubic Kobra X o Kobra 4 in una stampante compatibile con Moonraker. Senza Klipper, senza Raspberry Pi, senza modificare il firmware.',
        readDocs: 'Leggi la documentazione',
        install: 'Installa',
        screenshotAlt: 'La dashboard di Kobralink',
        notFoundTitle: 'Pagina non trovata',
        notFoundBody: 'Questa pagina non esiste o è stata spostata.',
        backToDocs: 'Torna alla documentazione',
    },
    'zh-cn': {
        description: '适用于 Anycubic Kobra X 和 Kobra 4 打印机的 Moonraker 桥接与网页控制台。',
        tagline: '将 Anycubic Kobra X 或 Kobra 4 变成兼容 Moonraker 的打印机。无需 Klipper，无需树莓派，无需更改固件。',
        readDocs: '阅读文档',
        install: '安装',
        screenshotAlt: 'Kobralink 控制台',
        notFoundTitle: '页面不存在',
        notFoundBody: '此页面不存在或已被移动。',
        backToDocs: '返回文档',
    },
    'pt-br': {
        description: 'Ponte Moonraker e painel web para as impressoras Anycubic Kobra X e Kobra 4.',
        tagline:
            'Transforme uma Anycubic Kobra X ou Kobra 4 em uma impressora compatível com Moonraker. Sem Klipper, sem Raspberry Pi, sem alterar o firmware.',
        readDocs: 'Ler a documentação',
        install: 'Instalar',
        screenshotAlt: 'O painel do Kobralink',
        notFoundTitle: 'Página não encontrada',
        notFoundBody: 'Esta página não existe ou foi movida.',
        backToDocs: 'Voltar à documentação',
    },
};
