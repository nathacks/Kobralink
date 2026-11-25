import { i18n, toLang } from '@/lib/i18n';
import { docsLlms } from '@/lib/source';

export const revalidate = false;
export const dynamicParams = false;

export async function GET(_req: Request, { params }: RouteContext<'/llms.mdx/[...path]'>) {
    const { path } = await params;
    return (await docsLlms.serve(`/${path.join('/')}`, toLang(path[0]))) ?? new Response(null, { status: 404 });
}

export async function generateStaticParams() {
    const params: { path: string[] }[] = [];
    for (const lang of i18n.languages) {
        for (const file of await docsLlms.files(lang)) {
            if (file.endsWith('.md')) params.push({ path: decodeURI(file).slice(1).split('/') });
        }
    }
    return params;
}
