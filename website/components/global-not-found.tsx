'use client';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { useEffect, useState } from 'react';
import { NotFoundContent } from '@/components/not-found';
import { Provider } from '@/components/provider';
import { htmlLang, isLang, type Lang, pickLang } from '@/lib/i18n';
import { baseOptions, translations } from '@/lib/layout.shared';

function langFromLocation(): Lang {
    const segment = window.location.pathname.replace(/^\/Kobralink/, '').split('/')[1];
    return isLang(segment) ? segment : pickLang(navigator.languages);
}

export function GlobalNotFoundBody() {
    const [lang, setLang] = useState<Lang>('en');
    useEffect(() => {
        const found = langFromLocation();
        document.documentElement.lang = htmlLang[found];
        setLang(found);
    }, []);
    return (
        <Provider i18n={i18nProvider(translations, lang)}>
            <HomeLayout {...baseOptions(lang)}>
                <NotFoundContent lang={lang} />
            </HomeLayout>
        </Provider>
    );
}
