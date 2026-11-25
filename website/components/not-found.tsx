import Link from 'next/link';
import { type Lang, siteText } from '@/lib/i18n';
import { docsRoute } from '@/lib/shared';

export function NotFoundContent({ lang }: { lang: Lang }) {
    const t = siteText[lang];
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
            <p className="text-7xl font-semibold text-fd-primary">404</p>
            <h1 className="text-2xl font-semibold">{t.notFoundTitle}</h1>
            <p className="text-fd-muted-foreground">{t.notFoundBody}</p>
            <Link
                href={`/${lang}${docsRoute}`}
                className="rounded-full bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground"
            >
                {t.backToDocs}
            </Link>
        </div>
    );
}
