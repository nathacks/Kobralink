import { generateOGImage } from 'fumadocs-ui/og';
import { notFound } from 'next/navigation';
import { appName, getPageImageUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET(_req: Request, { params }: RouteContext<'/[lang]/og/docs/[...slug]'>) {
    const { lang, slug } = await params;
    const page = source.getPage(slug.slice(0, -1), lang);
    if (!page) notFound();

    return generateOGImage({
        title: page.data.title,
        description: page.data.description,
        site: appName,
    });
}

export function generateStaticParams() {
    return source
        .getLanguages()
        .flatMap(({ language, pages }) =>
            pages.map((page) => ({ lang: language, slug: getPageImageUrl(page).segments })),
        );
}
