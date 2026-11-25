import { i18nProvider } from 'fumadocs-ui/i18n';
import type { Metadata } from 'next';
import { Provider } from '@/components/provider';
import { outfit } from '@/lib/fonts';
import { htmlLang, i18n, siteText, toLang } from '@/lib/i18n';
import { translations } from '@/lib/layout.shared';
import { appName, siteUrl } from '@/lib/shared';
import '../global.css';

export const dynamicParams = false;

export function generateStaticParams() {
    return i18n.languages.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
    const lang = toLang((await params).lang);
    return {
        metadataBase: new URL(siteUrl),
        title: { default: appName, template: `%s · ${appName}` },
        description: siteText[lang].description,
    };
}

export default async function Layout({ params, children }: LayoutProps<'/[lang]'>) {
    const lang = toLang((await params).lang);
    return (
        <html lang={htmlLang[lang]} className={outfit.className} suppressHydrationWarning>
            <body className="flex min-h-screen flex-col">
                <Provider i18n={i18nProvider(translations, lang)}>{children}</Provider>
            </body>
        </html>
    );
}
