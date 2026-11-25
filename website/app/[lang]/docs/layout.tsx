import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { toLang } from '@/lib/i18n';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';

export default async function Layout({ params, children }: LayoutProps<'/[lang]/docs'>) {
    const lang = toLang((await params).lang);
    return (
        <DocsLayout tree={source.getPageTree(lang)} {...baseOptions(lang)}>
            {children}
        </DocsLayout>
    );
}
