import Image from 'next/image';
import Link from 'next/link';
import { siteText, toLang } from '@/lib/i18n';
import screenshot from '../../../../docs/interface.png';

export default async function HomePage({ params }: PageProps<'/[lang]'>) {
    const lang = toLang((await params).lang);
    const t = siteText[lang];
    return (
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-6 px-4 py-16 text-center">
            <h1 className="text-4xl font-semibold">Kobralink</h1>
            <p className="max-w-2xl text-lg text-fd-muted-foreground">{t.tagline}</p>
            <div className="flex flex-wrap justify-center gap-3">
                <Link
                    href={`/${lang}/docs`}
                    className="rounded-full bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground"
                >
                    {t.readDocs}
                </Link>
                <Link
                    href={`/${lang}/docs/getting-started/docker`}
                    className="rounded-full bg-fd-secondary px-6 py-2.5 font-medium text-fd-secondary-foreground"
                >
                    {t.install}
                </Link>
            </div>
            <Image src={screenshot} alt={t.screenshotAlt} className="rounded-3xl border" priority />
        </main>
    );
}
