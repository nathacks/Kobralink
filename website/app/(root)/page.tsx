import type { Metadata } from 'next';
import { LanguageRedirect } from '@/components/language-redirect';
import { i18n, languageNames } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Kobralink' };

export default function RootPage() {
    return (
        <main>
            <LanguageRedirect />
            <ul>
                {i18n.languages.map((lang) => (
                    <li key={lang}>
                        <a href={`/Kobralink/${lang}/`}>{languageNames[lang]}</a>
                    </li>
                ))}
            </ul>
        </main>
    );
}
